Bug on the live site: /schedules shows "Couldn't reach the Arc RPC — history unavailable" while every other page and the keeper bot read Arc fine. Cause in src/lib/scheduleHistory.ts: (a) makeClient() uses only ACTIVE_NETWORK.rpcUrl, with no fallback; (b) fetchScheduleHistory calls getLogs over a 50,000-block range in ONE request (CHUNK is defined but unused) — public RPCs reject large getLogs ranges, so it is reported as an RPC failure; fetchExecutedEvents/fetchCancelledEvents query deployBlock→head in one call too.

Fix (app only, no contract changes):
1. Schedule list must not depend on getLogs: read scheduleCount(), then getSchedule(id) for ids newest-first with bounded concurrency (~8, cap 200 ids), plus nextDueTime/remainingDeposit; filter by payer for /schedules and the Dashboard card. Only show the RPC error if scheduleCount()/getBlockNumber fails on every endpoint; a single failed getSchedule read shows that card as "Couldn't load" with retry, not a page-wide error.
2. All ScheduledSplit reads use viem fallback() over ACTIVE_NETWORK.rpcUrls (same as src/lib/history.ts).
3. Event history (executed payments, cancel refund, creation tx link on /s/:id) uses getLogs in 2,000-block chunks newest-first with the indexed id filter, and is non-fatal: if it fails, the page still shows live state from getSchedule and says "payment history unavailable".
4. Apply the same to /s/:id (ScheduleDetail.tsx) so it never needs logs to render.
Run vitest, typecheck, lint and build; report results. Keep it small.
