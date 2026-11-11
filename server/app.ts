import { Hono } from "hono";
import type { Store } from "./store";
import { JUDGE_IDS, JudgeId, JudgePick, MoodLevel, computeMoodLevel, resolveJudgeId } from "../shared/judges";
import { cleanStatement, generateRoomCode, ROOM_CODE_RE, safetyPrefilter } from "../shared/text";
import { Verdict, validateVerdict } from "../shared/verdict";
import { CallModel, Lang, judgeCase } from "../shared/prompt";

export const CASE_TTL_MS = 3 * 24 * 3600 * 1000;
export const VOTE_MS = 30_000;
export const REVEAL_DELAY_MS = 2_500;
export const MAX_APPEALS = 3;

export type PID = "a" | "b";
export type CaseState = "waiting_for_partner" | "judge_vote" | "drafting" | "judging" | "judge_error" | "verdict" | "safety";

interface Statement { text: string; apology: boolean }
interface Round { statements: { a?: Statement; b?: Statement }; verdict?: Verdict; mood?: MoodLevel; revealAt?: number }
interface Player { name: string; tokenHash: string }
export interface Case {
  code: string; lang: Lang; state: CaseState; createdAt: number; expiresAt: number;
  players: { a: Player; b?: Player };
  votes: { a?: JudgePick; b?: JudgePick }; votesRevealed: boolean; voteDeadline?: number;
  judgeId?: JudgeId; coinFlip?: { a: JudgeId; b: JudgeId; winner: JudgeId };
  appealCount: number; rounds: Round[]; errorKind?: "model" | "cap";
}

export interface Deps {
  store: Store; callModel: CallModel; isRealModel?: boolean;
  now?: () => number; rng?: () => number; dailyCap?: number;
}

class HttpError extends Error { constructor(public status: number, public code: string) { super(code); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newToken() { const b = new Uint8Array(32); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }

export function createApp(deps: Deps) {
  const { store, callModel } = deps;
  const now = deps.now ?? Date.now;
  const rng = deps.rng ?? Math.random;
  const app = new Hono();
  const key = (code: string) => `case:${code}`;

  async function save(c: Case) {
    await store.set(key(c.code), c, Math.max(1, Math.ceil((c.expiresAt - now()) / 1000)));
  }

  /** Load -> mutate -> save under a per-case lock. */
  async function mutate<T>(code: string, fn: (c: Case) => T | Promise<T>): Promise<{ c: Case; r: T }> {
    const lock = `lock:${code}`;
    let got = false;
    for (let i = 0; i < 60 && !got; i++) { got = await store.setNX(lock, 1, 10); if (!got) await sleep(15); }
    if (!got) throw new HttpError(503, "busy");
    try {
      const c = await store.get<Case>(key(code));
      if (!c) throw new HttpError(404, "case_not_found");
      const r = await fn(c);
      await save(c);
      return { c, r };
    } finally { await store.del(lock); }
  }

  async function identify(c: Case, token: string | undefined): Promise<PID | null> {
    if (!token) return null;
    const h = await sha256(token);
    if (c.players.a.tokenHash === h) return "a";
    if (c.players.b && c.players.b.tokenHash === h) return "b";
    return null;
  }

  async function limit(k: string, max: number, windowSec: number) {
    if ((await store.incr(k, windowSec)) > max) throw new HttpError(429, "rate_limited");
  }
  const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";

  // ---- vote resolution (pure-ish, called inside lock) ----
  function resolveVote(c: Case) {
    const { a, b } = c.votes;
    let judge: JudgeId;
    if (a && b && a === b) judge = resolveJudgeId(a, rng);
    else if (a && !b) judge = resolveJudgeId(a, rng);
    else if (b && !a) judge = resolveJudgeId(b, rng);
    else if (!a && !b) judge = resolveJudgeId("surprise", rng);
    else {
      const ra = resolveJudgeId(a!, rng), rb = resolveJudgeId(b!, rng);
      if (ra === rb) judge = ra;
      else { judge = rng() < 0.5 ? ra : rb; c.coinFlip = { a: ra, b: rb, winner: judge }; }
    }
    c.judgeId = judge; c.votesRevealed = true; c.state = "drafting";
  }
  /** Lazy timer: serverless has no background process, so expiry is applied on read. */
  function tick(c: Case): boolean {
    if (c.state === "judge_vote" && c.voteDeadline !== undefined && now() >= c.voteDeadline) { resolveVote(c); return true; }
    return false;
  }

  // ---- the ONLY place case data is turned into something a client sees ----
  function view(c: Case, me: PID) {
    const other: PID = me === "a" ? "b" : "a";
    const cur = c.rounds.length - 1;
    const revealedVotes = c.votesRevealed;
    const rounds = c.rounds.map((r, i) => {
      if (r.verdict) {
        // Statements become visible to both only once that round's verdict exists.
        return { statements: { me: r.statements[me] ?? null, other: r.statements[other] ?? null }, verdict: r.verdict, mood: r.mood ?? 0, revealAt: r.revealAt ?? 0 };
      }
      return { statements: { me: r.statements[me] ?? null, other: null }, otherSubmitted: !!r.statements[other], verdict: null, mood: 0, revealAt: 0, current: i === cur };
    });
    const safety = c.state === "safety";
    return {
      code: c.code, lang: c.lang, state: c.state, me, serverNow: now(), expiresAt: c.expiresAt,
      players: { me: c.players[me]!.name, other: c.players[other]?.name ?? null },
      vote: { myPick: c.votes[me] ?? null, otherPick: revealedVotes ? c.votes[other] ?? null : null, otherVoted: !!c.votes[other], revealed: revealedVotes, deadline: c.voteDeadline ?? null },
      judgeId: c.judgeId ?? null, coinFlip: c.coinFlip ?? null,
      appealCount: c.appealCount, canAppeal: c.state === "verdict" && c.appealCount < MAX_APPEALS,
      // Safety: no verdicts and no statements, whatever is in storage.
      rounds: safety ? rounds.map((r) => ({ ...r, verdict: null, statements: { me: null, other: null } })) : rounds,
      error: c.state === "judge_error" ? c.errorKind ?? "model" : null,
    };
  }

  async function authed(code: string, token: string | undefined) {
    code = code.toUpperCase();
    if (!ROOM_CODE_RE.test(code)) throw new HttpError(404, "case_not_found");
    return code;
  }
  const body = async (c: any) => (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const tokenOf = (c: any) => c.req.header("x-player-token") as string | undefined;
  const name = (v: unknown, fallback: string) => cleanStatement(v).slice(0, 30) || fallback;

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code }, err.status as any);
    console.error("unhandled", (err as Error)?.name); // never log message bodies or statements
    return c.json({ error: "server_error" }, 500);
  });

  // ---------- create ----------
  app.post("/api/cases", async (c) => {
    await limit(`rl:create:${ipOf(c.req.raw)}`, 20, 600);
    const b = await body(c);
    const lang: Lang = b.lang === "id" ? "id" : "en";
    const token = newToken();
    const t = now();
    const base: Omit<Case, "code"> = {
      lang, state: "waiting_for_partner", createdAt: t, expiresAt: t + CASE_TTL_MS,
      players: { a: { name: name(b.name, "Player A"), tokenHash: await sha256(token) } },
      votes: {}, votesRevealed: false, appealCount: 0, rounds: [{ statements: {} }],
    };
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode(rng);
      if (await store.setNX(key(code), { ...base, code }, Math.ceil(CASE_TTL_MS / 1000))) {
        return c.json({ code, token, expiresAt: base.expiresAt }, 201);
      }
    }
    throw new HttpError(503, "busy");
  });

  // ---------- join ----------
  app.post("/api/cases/:code/join", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    await limit(`rl:join:${ipOf(c.req.raw)}`, 60, 600);
    const b = await body(c);
    const token = newToken();
    const hash = await sha256(token);
    const pname = name(b.name, "Player B");
    const { c: cs } = await mutate(code, (cs) => {
      if (cs.players.b || cs.state !== "waiting_for_partner") throw new HttpError(409, "case_full");
      cs.players.b = { name: pname, tokenHash: hash };
      cs.state = "judge_vote";
      cs.voteDeadline = now() + VOTE_MS;
    });
    return c.json({ code, token, lang: cs.lang, expiresAt: cs.expiresAt }, 201);
  });

  // ---------- poll ----------
  app.get("/api/cases/:code", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    let cs = await store.get<Case>(key(code));
    if (!cs) throw new HttpError(404, "case_not_found");
    const me = await identify(cs, tokenOf(c));
    if (!me) throw new HttpError(401, "unauthorized");
    if (cs.state === "judge_vote" && cs.voteDeadline !== undefined && now() >= cs.voteDeadline) {
      cs = (await mutate(code, (x) => tick(x))).c;
    }
    return c.json(view(cs, me));
  });

  // ---------- vote ----------
  app.post("/api/cases/:code/vote", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    const b = await body(c);
    const pick = b.pick as JudgePick;
    if (pick !== "surprise" && !JUDGE_IDS.includes(pick as JudgeId)) throw new HttpError(400, "bad_pick");
    const token = tokenOf(c);
    const { c: cs, r: me } = await mutate(code, async (cs) => {
      const me = await identify(cs, token);
      if (!me) throw new HttpError(401, "unauthorized");
      tick(cs);
      if (cs.state !== "judge_vote") throw new HttpError(409, "wrong_state");
      if (cs.votes[me]) throw new HttpError(409, "already_voted");
      cs.votes[me] = pick;
      if (cs.votes.a && cs.votes.b) resolveVote(cs);
      return me;
    });
    return c.json(view(cs, me));
  });

  // ---------- statement ----------
  app.post("/api/cases/:code/statement", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    await limit(`rl:stmt:${ipOf(c.req.raw)}`, 60, 600);
    const b = await body(c);
    const text = cleanStatement(b.text);
    if (!text) throw new HttpError(400, "empty_statement");
    const token = tokenOf(c);
    const { c: cs, r } = await mutate(code, async (cs) => {
      const me = await identify(cs, token);
      if (!me) throw new HttpError(401, "unauthorized");
      tick(cs);
      if (cs.state !== "drafting") throw new HttpError(409, "wrong_state");
      const round = cs.rounds[cs.rounds.length - 1];
      if (round.statements[me]) throw new HttpError(409, "already_submitted");
      round.statements[me] = { text, apology: b.apology === true };
      let judge = false;
      if (round.statements.a && round.statements.b) { cs.state = "judging"; judge = true; } // atomic: only one request flips this
      return { me, judge };
    });
    if (r.judge) await runJudging(code);
    const fresh = (await store.get<Case>(key(code))) ?? cs;
    return c.json(view(fresh, r.me));
  });

  // ---------- judging ----------
  async function runJudging(code: string) {
    const cs0 = await store.get<Case>(key(code));
    if (!cs0 || cs0.state !== "judging") return;
    const round = cs0.rounds[cs0.rounds.length - 1];
    const A = round.statements.a!, B = round.statements.b!;

    // Safety layer 1: code prefilter, no model call at all.
    if (safetyPrefilter(A.text, B.text)) { await mutate(code, (x) => { if (x.state === "judging") x.state = "safety"; }); return; }

    try {
      await limit(`rl:judge:${code}`, 10, Math.ceil(CASE_TTL_MS / 1000));
      if (deps.isRealModel) {
        const day = new Date(now()).toISOString().slice(0, 10);
        if ((await store.incr(`cap:${day}`, 2 * 24 * 3600)) > (deps.dailyCap ?? 300)) throw new HttpError(503, "cap");
      }
    } catch (e) {
      await mutate(code, (x) => { if (x.state === "judging") { x.state = "judge_error"; x.errorKind = "cap"; } });
      return;
    }

    const prev = cs0.rounds[cs0.rounds.length - 2]?.verdict;
    const mood = computeMoodLevel({ appealCount: cs0.appealCount, lastNewEvidence: prev?.new_evidence === true, apology: A.apology || B.apology });
    const previousSummary = prev && !prev.safety_flag
      ? `${prev.ruling} (fault: A ${prev.fault_split!.a}%, B ${prev.fault_split!.b}%)` : undefined;

    const v = await judgeCase(
      { judgeId: cs0.judgeId!, mood, lang: cs0.lang, a: { name: cs0.players.a.name, statement: A.text }, b: { name: cs0.players.b!.name, statement: B.text }, previousSummary },
      callModel, validateVerdict,
    ) as Verdict | null;

    await mutate(code, (x) => {
      if (x.state !== "judging") return;
      const r = x.rounds[x.rounds.length - 1];
      if (!v) { x.state = "judge_error"; x.errorKind = "model"; return; }
      if (v.safety_flag) { x.state = "safety"; return; } // layer 2: model flag; verdict never stored
      if (!prev) v.new_evidence = false; // first round has nothing to add evidence to; never trust the model here
      r.verdict = v; r.mood = mood; r.revealAt = now() + REVEAL_DELAY_MS; x.state = "verdict"; x.errorKind = undefined;
    });
  }

  app.post("/api/cases/:code/retry", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    const token = tokenOf(c);
    const { r: me } = await mutate(code, async (cs) => {
      const me = await identify(cs, token);
      if (!me) throw new HttpError(401, "unauthorized");
      if (cs.state !== "judge_error") throw new HttpError(409, "wrong_state");
      cs.state = "judging";
      return me;
    });
    await runJudging(code);
    const fresh = (await store.get<Case>(key(code)))!;
    return c.json(view(fresh, me));
  });

  // ---------- appeal ----------
  app.post("/api/cases/:code/appeal", async (c) => {
    const code = await authed(c.req.param("code"), undefined);
    const token = tokenOf(c);
    const { c: cs, r: me } = await mutate(code, async (cs) => {
      const me = await identify(cs, token);
      if (!me) throw new HttpError(401, "unauthorized");
      if (cs.state !== "verdict") throw new HttpError(409, "wrong_state");
      if (cs.appealCount >= MAX_APPEALS) throw new HttpError(409, "appeal_limit");
      cs.appealCount++; cs.rounds.push({ statements: {} }); cs.state = "drafting";
      return me;
    });
    return c.json(view(cs, me));
  });

  return app;
}
