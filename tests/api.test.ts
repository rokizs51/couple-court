import { describe, it, expect, beforeEach } from "vitest";
import { createApp, VOTE_MS, MAX_APPEALS } from "../server/app";
import { MemoryStore } from "../server/store";
import { mockModel } from "../server/model";

let t = 1_000_000;
let store: MemoryStore;
let calls = 0;
const counting = async (s: string, u: string) => { calls++; return mockModel(s, u); };

function mk(model = counting, extra: any = {}) {
  store = new MemoryStore(() => t);
  const app = createApp({ store, callModel: model, now: () => t, rng: () => 0.1, ...extra });
  const req = async (method: string, path: string, token?: string, body?: any) => {
    const res = await app.request(path, {
      method, headers: { "content-type": "application/json", ...(token ? { "x-player-token": token } : {}), "cf-connecting-ip": "1.2.3." + Math.floor(Math.random() * 250) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { app, req };
}

async function setup(lang = "en") {
  const { req } = mk();
  const c = await req("POST", "/api/cases", undefined, { name: "Rani", lang });
  const code = c.json.code, ta = c.json.token;
  const j = await req("POST", `/api/cases/${code}/join`, undefined, { name: "Budi" });
  return { req, code, ta, tb: j.json.token };
}
async function toDrafting(s: Awaited<ReturnType<typeof setup>>) {
  await s.req("POST", `/api/cases/${s.code}/vote`, s.ta, { pick: "savage" });
  await s.req("POST", `/api/cases/${s.code}/vote`, s.tb, { pick: "savage" });
}

beforeEach(() => { t = 1_000_000; calls = 0; });

describe("create / join", () => {
  it("creates, joins, rejects a third player and bad codes", async () => {
    const s = await setup();
    expect(s.code).toMatch(/^[A-Z2-9]{4}$/);
    const third = await s.req("POST", `/api/cases/${s.code}/join`, undefined, { name: "Eve" });
    expect(third.status).toBe(409);
    expect((await s.req("POST", `/api/cases/ZZZZ/join`)).status).toBe(404);
    expect((await s.req("POST", `/api/cases/12/join`)).status).toBe(404);
    const poll = await s.req("GET", `/api/cases/${s.code}`, s.ta);
    expect(poll.json.state).toBe("judge_vote");
    expect(poll.json.players.other).toBe("Budi");
  });
  it("tokens are never stored raw and polls need a valid token", async () => {
    const s = await setup();
    for (const [, v] of store.dump()) { expect(v).not.toContain(s.ta); expect(v).not.toContain(s.tb); }
    expect((await s.req("GET", `/api/cases/${s.code}`)).status).toBe(401);
    expect((await s.req("GET", `/api/cases/${s.code}`, "x".repeat(64))).status).toBe(401);
  });
  it("case TTL is 3 days", async () => {
    const s = await setup();
    expect(store.ttlOf(`case:${s.code}`)!).toBeLessThanOrEqual(3 * 24 * 3600 * 1000);
    t += 3 * 24 * 3600 * 1000 + 1;
    expect((await s.req("GET", `/api/cases/${s.code}`, s.ta)).status).toBe(404);
  });
});

describe("judge vote", () => {
  it("hides the other pick until both voted; matching picks assign judge", async () => {
    const s = await setup();
    await s.req("POST", `/api/cases/${s.code}/vote`, s.ta, { pick: "zen" });
    const pb = await s.req("GET", `/api/cases/${s.code}`, s.tb);
    expect(pb.json.vote.otherVoted).toBe(true);
    expect(pb.json.vote.otherPick).toBeNull();
    expect(JSON.stringify(pb.json)).not.toContain("zen");
    await s.req("POST", `/api/cases/${s.code}/vote`, s.tb, { pick: "zen" });
    const pa = await s.req("GET", `/api/cases/${s.code}`, s.ta);
    expect(pa.json.judgeId).toBe("zen"); expect(pa.json.state).toBe("drafting"); expect(pa.json.coinFlip).toBeNull();
  });
  it("mismatch triggers coin flip between the two picks", async () => {
    const s = await setup();
    await s.req("POST", `/api/cases/${s.code}/vote`, s.ta, { pick: "zen" });
    await s.req("POST", `/api/cases/${s.code}/vote`, s.tb, { pick: "savage" });
    const p = await s.req("GET", `/api/cases/${s.code}`, s.ta);
    expect(p.json.coinFlip.a).toBe("zen"); expect(p.json.coinFlip.b).toBe("savage");
    expect(["zen", "savage"]).toContain(p.json.judgeId);
  });
  it("timeout: lone voter's pick wins; no votes -> random", async () => {
    const s = await setup();
    await s.req("POST", `/api/cases/${s.code}/vote`, s.ta, { pick: "grandma" });
    t += VOTE_MS + 1;
    const p = await s.req("GET", `/api/cases/${s.code}`, s.tb);
    expect(p.json.judgeId).toBe("grandma"); expect(p.json.state).toBe("drafting");
    const s2 = await setup(); t += VOTE_MS + 1;
    expect((await s2.req("GET", `/api/cases/${s2.code}`, s2.ta)).json.judgeId).toBeTruthy();
  });
  it("surprise resolves; double vote and bad pick rejected", async () => {
    const s = await setup();
    await s.req("POST", `/api/cases/${s.code}/vote`, s.ta, { pick: "surprise" });
    await s.req("POST", `/api/cases/${s.code}/vote`, s.tb, { pick: "surprise" });
    expect((await s.req("GET", `/api/cases/${s.code}`, s.ta)).json.judgeId).toMatch(/grandma|savage|shakespeare|bestie|zen/);
    const s2 = await setup();
    await s2.req("POST", `/api/cases/${s2.code}/vote`, s2.ta, { pick: "zen" });
    expect((await s2.req("POST", `/api/cases/${s2.code}/vote`, s2.ta, { pick: "zen" })).status).toBe(409);
    expect((await s2.req("POST", `/api/cases/${s2.code}/vote`, s2.tb, { pick: "judge-dredd" })).status).toBe(400);
  });
});

describe("PRIVACY: statements", () => {
  it("player B never sees A's text in any field before the verdict", async () => {
    const s = await setup(); await toDrafting(s);
    const SECRET = "ZEBRAQUOKKA-secret-statement";
    const r = await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: SECRET });
    expect(r.status).toBe(200);
    const pb = await s.req("GET", `/api/cases/${s.code}`, s.tb);
    expect(JSON.stringify(pb.json)).not.toContain(SECRET);
    expect(pb.json.rounds[0].otherSubmitted).toBe(true);
    const pa = await s.req("GET", `/api/cases/${s.code}`, s.ta);
    expect(pa.json.rounds[0].statements.me.text).toBe(SECRET);
    // also not leaked in the response to B's own submit... until verdict exists
    const rb = await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "my side" });
    expect(rb.json.state).toBe("verdict");
  });
  it("statements become visible to both only once the verdict exists", async () => {
    const s = await setup(); await toDrafting(s);
    await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "AAA text" });
    await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "BBB text" });
    const pa = await s.req("GET", `/api/cases/${s.code}`, s.ta);
    expect(pa.json.state).toBe("verdict");
    expect(pa.json.rounds[0].statements.other.text).toBe("BBB text");
    expect(pa.json.rounds[0].verdict.fault_split.a + pa.json.rounds[0].verdict.fault_split.b).toBe(100);
    expect(pa.json.rounds[0].revealAt).toBeGreaterThan(pa.json.serverNow);
  });
  it("no raw statement text leaks to the logs-facing layer or token hashes", async () => {
    const s = await setup(); await toDrafting(s);
    const r = await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "x".repeat(900) });
    expect(r.json.rounds[0].statements.me.text.length).toBe(500);
    expect(JSON.stringify(r.json)).not.toMatch(/tokenHash/);
  });
  it("cannot submit twice, before judge picked, or without a token", async () => {
    const s = await setup();
    expect((await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "early" })).status).toBe(409);
    await toDrafting(s);
    await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "one" });
    expect((await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "two" })).status).toBe(409);
    expect((await s.req("POST", `/api/cases/${s.code}/statement`, undefined, { text: "x" })).status).toBe(401);
    expect((await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "   " })).status).toBe(400);
  });
});

describe("judging", () => {
  it("simultaneous submissions produce exactly one model call", async () => {
    const s = await setup(); await toDrafting(s);
    await Promise.all([
      s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "mine" }),
      s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "yours" }),
    ]);
    expect(calls).toBe(1);
    expect((await s.req("GET", `/api/cases/${s.code}`, s.ta)).json.state).toBe("verdict");
  });
  it("bahasa case yields Indonesian output", async () => {
    const s = await setup("id"); await toDrafting(s);
    await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "dia lupa jemput" });
    const r = await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "macet parah" });
    expect(r.json.rounds[0].verdict.closing_line).toBe("Sidang ditutup.");
  });
  it("prefilter safety: no model call, no verdict, no fault %, no statements", async () => {
    const s = await setup(); await toDrafting(s);
    await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "I'm scared of how they react" });
    const r = await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "dishes" });
    expect(calls).toBe(0);
    expect(r.json.state).toBe("safety");
    const out = JSON.stringify((await s.req("GET", `/api/cases/${s.code}`, s.tb)).json);
    expect(out).not.toMatch(/fault_split|scared|dishes/);
  });
  it("model safety flag: no verdict stored", async () => {
    const { req } = mk(async () => JSON.stringify({ safety_flag: true, fault_split: { a: 10, b: 90 } }));
    const c = await req("POST", "/api/cases", undefined, { name: "A" });
    const j = await req("POST", `/api/cases/${c.json.code}/join`, undefined, { name: "B" });
    const code = c.json.code;
    await req("POST", `/api/cases/${code}/vote`, c.json.token, { pick: "zen" });
    await req("POST", `/api/cases/${code}/vote`, j.json.token, { pick: "zen" });
    await req("POST", `/api/cases/${code}/statement`, c.json.token, { text: "innocent chores" });
    const r = await req("POST", `/api/cases/${code}/statement`, j.json.token, { text: "innocent dishes" });
    expect(r.json.state).toBe("safety");
    expect(JSON.stringify(store.dump())).not.toContain("fault_split");
  });
  it("invalid model JSON twice -> friendly error state, retry works, no internals", async () => {
    let ok = false;
    const { req } = mk(async (s, u) => (ok ? mockModel(s, u) : "not json at all SECRETDETAIL"));
    const c = await req("POST", "/api/cases", undefined, {}); const code = c.json.code;
    const j = await req("POST", `/api/cases/${code}/join`, undefined, {});
    await req("POST", `/api/cases/${code}/vote`, c.json.token, { pick: "zen" });
    await req("POST", `/api/cases/${code}/vote`, j.json.token, { pick: "zen" });
    await req("POST", `/api/cases/${code}/statement`, c.json.token, { text: "a" });
    const r = await req("POST", `/api/cases/${code}/statement`, j.json.token, { text: "b" });
    expect(r.json.state).toBe("judge_error");
    expect(JSON.stringify(r.json)).not.toContain("SECRETDETAIL");
    ok = true;
    const r2 = await req("POST", `/api/cases/${code}/retry`, c.json.token);
    expect(r2.json.state).toBe("verdict");
  });
  it("daily cost cap blocks the real model", async () => {
    const { req } = mk(counting, { isRealModel: true, dailyCap: 1, rng: (() => { let i = 0; return () => ((i++ * 0.137) % 1); })() });
    const run = async () => {
      const c = await req("POST", "/api/cases", undefined, {}); const code = c.json.code;
      const j = await req("POST", `/api/cases/${code}/join`, undefined, {});
      await req("POST", `/api/cases/${code}/vote`, c.json.token, { pick: "zen" });
      await req("POST", `/api/cases/${code}/vote`, j.json.token, { pick: "zen" });
      await req("POST", `/api/cases/${code}/statement`, c.json.token, { text: "a" });
      return (await req("POST", `/api/cases/${code}/statement`, j.json.token, { text: "b" })).json.state;
    };
    expect(await run()).toBe("verdict");
    expect(await run()).toBe("judge_error");
    expect(calls).toBe(1);
  });
});

describe("appeals", () => {
  it("full appeal flow: hidden-until-both again, 3 max, supreme mood on #3", async () => {
    const s = await setup(); await toDrafting(s);
    const submit = async (n: number) => {
      await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: `A-round-${n}-SECRET` });
      const pb = await s.req("GET", `/api/cases/${s.code}`, s.tb);
      expect(JSON.stringify(pb.json)).not.toContain(`A-round-${n}-SECRET`);
      return s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: `B-round-${n}` });
    };
    let r = await submit(0);
    expect(r.json.canAppeal).toBe(true);
    for (let i = 1; i <= MAX_APPEALS; i++) {
      const ap = await s.req("POST", `/api/cases/${s.code}/appeal`, s.tb);
      expect(ap.json.state).toBe("drafting"); expect(ap.json.appealCount).toBe(i);
      r = await submit(i);
      expect(r.json.state).toBe("verdict");
    }
    expect(r.json.rounds.length).toBe(4);
    expect(r.json.rounds[3].mood).toBe(3);
    expect(r.json.canAppeal).toBe(false);
    expect((await s.req("POST", `/api/cases/${s.code}/appeal`, s.ta)).status).toBe(409);
    expect(r.json.rounds[1].mood).toBeGreaterThanOrEqual(0);
  });
  it("judge stays locked; appeal needs a verdict first", async () => {
    const s = await setup(); await toDrafting(s);
    expect((await s.req("POST", `/api/cases/${s.code}/appeal`, s.ta)).status).toBe(409);
    const before = (await s.req("GET", `/api/cases/${s.code}`, s.ta)).json.judgeId;
    await s.req("POST", `/api/cases/${s.code}/statement`, s.ta, { text: "a" });
    await s.req("POST", `/api/cases/${s.code}/statement`, s.tb, { text: "b" });
    await s.req("POST", `/api/cases/${s.code}/appeal`, s.ta);
    expect((await s.req("GET", `/api/cases/${s.code}`, s.tb)).json.judgeId).toBe(before);
  });
});
