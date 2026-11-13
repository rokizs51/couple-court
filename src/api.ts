import type { JudgeId, JudgePick, MoodLevel } from "../shared/judges";
import type { Verdict } from "../shared/verdict";

export interface Statement { text: string; apology: boolean }
export interface RoundView {
  statements: { me: Statement | null; other: Statement | null };
  verdict: Verdict | null; mood: MoodLevel; revealAt: number; otherSubmitted?: boolean; current?: boolean;
}
export interface CaseView {
  code: string; lang: "en" | "id"; me: "a" | "b";
  state: "waiting_for_partner" | "judge_vote" | "drafting" | "judging" | "judge_error" | "verdict" | "safety";
  serverNow: number; expiresAt: number;
  players: { me: string; other: string | null };
  vote: { myPick: JudgePick | null; otherPick: JudgePick | null; otherVoted: boolean; revealed: boolean; deadline: number | null };
  judgeId: JudgeId | null; coinFlip: { a: JudgeId; b: JudgeId; winner: JudgeId } | null;
  appealCount: number; canAppeal: boolean; rounds: RoundView[]; error: "model" | "cap" | "closed" | null;
}

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }

const tk = (code: string) => `cc:token:${code}`;
export const getToken = (code: string) => localStorage.getItem(tk(code));
export const setToken = (code: string, t: string) => localStorage.setItem(tk(code), t);
export const forgetToken = (code: string) => localStorage.removeItem(tk(code));

/** Estimated (serverTime - clientTime), using the midpoint of the request. */
export let clockOffset = 0;

async function call<T>(method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
  const t0 = Date.now();
  const r = await fetch(path, {
    method, cache: "no-store",
    headers: { "content-type": "application/json", ...(token ? { "x-player-token": token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t1 = Date.now();
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? "error");
  if (typeof j.serverNow === "number") clockOffset = j.serverNow - (t0 + t1) / 2;
  return j as T;
}

export const api = {
  create: (name: string, lang: string) => call<{ code: string; token: string }>("POST", "/api/cases", null, { name, lang }),
  join: (code: string, name: string) => call<{ code: string; token: string }>("POST", `/api/cases/${code}/join`, null, { name }),
  get: (code: string) => call<CaseView>("GET", `/api/cases/${code}`, getToken(code)),
  vote: (code: string, pick: JudgePick) => call<CaseView>("POST", `/api/cases/${code}/vote`, getToken(code), { pick }),
  statement: (code: string, text: string, apology: boolean) => call<CaseView>("POST", `/api/cases/${code}/statement`, getToken(code), { text, apology }),
  appeal: (code: string) => call<CaseView>("POST", `/api/cases/${code}/appeal`, getToken(code)),
  retry: (code: string) => call<CaseView>("POST", `/api/cases/${code}/retry`, getToken(code)),
};
