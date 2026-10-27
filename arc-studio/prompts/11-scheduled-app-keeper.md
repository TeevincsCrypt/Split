Build the scheduled-payments UI and the keeper bot for the ScheduledSplit contract you deployed to Arc Testnet last turn. Read context/docs/SPEC-SCHEDULED.md ("Keeper bot"). Do not change the contracts.

App:
1. Config: VITE_SCHEDULED_SPLIT_ADDRESS and VITE_SCHEDULED_SPLIT_DEPLOY_BLOCK (same validation style as the distributor vars; feature hidden with a clear note when unset). Update .env.example with the testnet values.
2. Create split: after Review, a choice "Pay now" (existing flow, unchanged) or "Schedule". Schedule form: date + time picker in the user's local timezone (show the timezone and the UTC equivalent), repeat = none / weekly / every 2 weeks / monthly (same day-of-month; for 29–31 use the last day of shorter months), number of payments 1–24. Show the full list of computed payment dates, amount per payment, total deposit = amount × count, and the notice that funds are locked in the contract until paid or cancelled, payments run at or shortly after the time (never before), and cancel refunds all unpaid amounts.
3. Approve exactly the total deposit, then createSchedule; same receipt/pending/error handling as the distribute step; success only after the ScheduleCreated event is decoded from the receipt.
4. /schedules page: the connected payer's schedules (from ScheduleCreated events + getSchedule): status (upcoming / due / completed / cancelled), next payment time with countdown, paid x of n, remaining deposit, recipients. Actions: "Release now" when due (anyone can call execute — also show it on a public /s/:id page so a recipient can trigger their own pay), "Cancel & refund" for the payer with a confirm dialog. Executed payments link to the explorer and to a receipt.
5. Dashboard: an "Upcoming payments" card from real data.

Keeper:
6. scripts/keeper.ts (Bun + viem, fallback RPC transport with RPC_URL first): find due schedules, simulate then execute, loop while due, log tx hashes, never log the key, exit 0 when nothing is due, non-zero on failure. Unit-test the due-selection logic.
7. .github/workflows/keeper.yml: cron "*/5 * * * *" + workflow_dispatch, uses oven-sh/setup-bun, bun install --frozen-lockfile, runs the keeper with secrets.KEEPER_PRIVATE_KEY and vars SPLIT_NETWORK, SCHEDULED_SPLIT_ADDRESS, SCHEDULED_SPLIT_DEPLOY_BLOCK, RPC_URL. Minimal permissions (contents: read), concurrency group so runs never overlap.
8. docs/KEEPER.md: exact steps to create a dedicated keeper wallet, fund it with a little USDC for gas, add the GitHub secret and variables, and test with workflow_dispatch.

Run vitest, typecheck, lint and build; report results.
