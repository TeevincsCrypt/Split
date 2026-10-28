Code review of scripts/keeper.ts and .github/workflows/keeper.yml found real bugs. Fix them; do not change contracts or app UI.

keeper.ts:
1. Discovery: replace the getLogs scan from the deploy block (it grows unbounded on Arc's fast blocks and silently skips failed chunks) with `scheduleCount()` and checking ids 1..count. Batch the isDue reads (multicall if the chain has Multicall3, otherwise bounded concurrency of ~10). A failed isDue read must be reported, not silently treated as "not due".
2. No infinite retry: if simulate or send fails for a schedule, do not retry it in this run. Cap total executes per run (e.g. 100) as a safety stop.
3. After waitForTransactionReceipt, check receipt.status; a reverted tx is a failure, not "Executed". Log block number with the hash on success.
4. Never leak secrets in logs: errors from viem include the RPC URL, which may contain a provider API key. Redact URLs (scheme://host/…) from every logged message, and log only BaseError.shortMessage. Never log the key or account.
5. DRY_RUN=true env: discover and simulate due executes, log what would be sent, send nothing.
6. RPC fallback list like the app: RPC_URL first, then the registry default, and for testnet also https://rpc.testnet.arc.network.
7. Validate SPLIT_NETWORK (testnet|mainnet only) and that the configured chain id matches eth_chainId before sending anything.
8. Keep unit tests for the pure due-selection / redaction helpers (move them into an importable module so tests don't need env/keys).

keeper.yml:
9. bun version from the repo: `bun-version-file: .bun-version` (not latest).
10. Pass the dry_run input via env (DRY_RUN: ${{ inputs.dry_run }}) instead of interpolating it into the shell, and make dry run actually simulate via the script.
11. Read RPC_URL from secrets (it may contain an API key), not vars; update docs/KEEPER.md accordingly.
12. docs/KEEPER.md: note that scheduled workflows only run on the default branch and GitHub disables them after 60 days without repo activity (how to re-enable), and that public-repo Actions logs are public.

Run vitest, typecheck, lint and build; report results.
