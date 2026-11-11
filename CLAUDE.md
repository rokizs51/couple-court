# Couple Court
Fun PWA: two partners file private statements from their own phones; an AI judge rules. Not counseling.

## Stack
Vite + React + TS PWA. Hono API (runs on Node, Cloudflare Workers, or Vercel). Redis-style KV with TTL
behind a `Store` interface (in-memory for dev/tests, Upstash in prod). Polling for sync. Vitest.
Pure logic lives in /shared. Treat prompt.ts and judges.ts as tuned: ask before rewriting.

## Non-negotiable rules
- Model API key is server-only. Never in client code.
- Server never sends a player's statement to the other before the verdict exists. Test at API-response level.
- Statements: 500 chars, cleanStatement(). Cases expire after 3 days.
- Mood from computeMoodLevel(), never the model.
- Safety: keyword prefilter (code) AND model safety_flag -> support screen, no verdict, no fault %.
- Mock model by default; real model opt-in via env var.
- Logs never contain statement text.

## State machine
waiting_for_partner, judge_vote, drafting, both_submitted, judging, verdict, (appeal -> drafting). Max 3 appeals.
Transition to judging must be atomic (lock) to avoid double model calls. Timers resolved lazily on GET from timestamps.

## Style
Small slices, tests for privacy and transitions, mobile first.
