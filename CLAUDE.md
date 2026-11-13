# Couple Court
Fun PWA: two partners file private statements from their own phones; an AI judge rules. Not counseling.

## Stack
Vite + React + TS PWA. Hono API (runs on Node, Cloudflare Workers, or Vercel). Redis-style KV with TTL
behind a `Store` interface (in-memory for dev/tests, Upstash in prod). Polling for sync. Vitest.
Pure logic lives in /shared. Treat prompt.ts and judges.ts as tuned: ask before rewriting.

## Non-negotiable rules
- Model API key is server-only. Never in client code.
- Server never sends a player's statement to the other before the verdict exists. Test at API-response level.
- Statements: 500 chars, cleanStatement(). Cases expire after 3 days. Statement text is DELETED from storage once the verdict exists (or on safety); only verdicts are kept for appeals. A failed judging keeps statements so Try again works.
- Mood from computeMoodLevel(), never the model.
- Safety: keyword prefilter (code) AND model safety_flag -> support screen, no verdict, no fault %.
- Mock model by default; real model opt-in via env var.
- Logs never contain statement text.

## State machine
waiting_for_partner, judge_vote, drafting, both_submitted, judging, verdict, (appeal -> drafting). Max 3 appeals.
Transition to judging must be atomic (lock) to avoid double model calls. Timers resolved lazily on GET from timestamps.

## Style
Small slices, tests for privacy and transitions, mobile first.

## Dev
`npx tsx server/dev.ts` (API :8787, mock model unless USE_REAL_MODEL=1 + ANTHROPIC_API_KEY in .env)
`npx vite` (web :5173, proxies /api). Build: `npx vite build`. Tests: `npx vitest run`.

## Deploy (Cloudflare)
Single Worker serves static `dist/` (assets) and `/api/*` (Hono). Store = UpstashStore (REST). See wrangler.toml.
Secrets via `npx wrangler secret put` only: ANTHROPIC_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
Local Workers test: `npx vite build && npx wrangler dev` with --var flags, e2e via `BASE_URL=... npx playwright test`.

## Design
Design lives in `docs/design/`. Read `DESIGN.md` first, then match the layout, colors and type of the PNGs.
Use only variables from `src/styles/tokens.css`. Do not invent new patterns for screens that are not designed; ask first.

## Judge key monitor
`GET /api/admin/status` (needs ADMIN_TOKEN secret; 404 when unset) reports model health, daily usage, and `?probe=1` tests the key live.
`node scripts/keymon.mjs status | rotate | setup-admin`. Keys are typed in the terminal, never in chat. Health record: Redis key `health:model`.
