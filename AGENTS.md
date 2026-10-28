# Split — USDC Payment Splitter

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Split lets teams, DAOs, freelancers, and businesses distribute USDC to multiple recipients in one transparent, onchain transaction. The payer approves the total amount once; the contract pulls it and distributes to each recipient atomically.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals) — address `0x3600000000000000000000000000000000000000` (Arc Testnet and Arc Mainnet)
- Toasts: Sonner

## Contract Deployments

### SplitDistributor

| Field | Value |
|---|---|
| Network | Arc Testnet (Chain ID 5042002) |
| Address | `0x43a159af83f4c836940e2e74c8a29ae677c39498` |
| Deploy tx | `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd` |
| Explorer | https://explorer.testnet.arc.io/address/0x43a159af83f4c836940e2e74c8a29ae677c39498 |
| Constructor arg | `usdc_ = 0x3600000000000000000000000000000000000000` (Arc Testnet official USDC) |
| ABI / artifact | `contracts/out/SplitDistributor.sol/SplitDistributor.json` |
| Metadata | `contracts/contract-metadata/SplitDistributor.json` |

## Key Files

- `src/App.tsx` - BrowserRouter root wiring all routes
- `src/pages/` - Landing, Dashboard, CreateSplit, Receipt (`/d/:id`), Activity, HowItWorks
- `src/components/create/` - 4 create-flow steps: StepEditor, StepReview, StepApprove, StepDistribute
- `src/components/` - Layout (nav + footer), WrongNetworkBanner, ConnectPrompt, ContractNotConfigured
- `src/config/networks.ts` - Env-driven network config. Reads VITE_SPLIT_NETWORK / VITE_SPLIT_DISTRIBUTOR_ADDRESS / VITE_SPLIT_DEPLOY_BLOCK
- `src/abi/SplitDistributor.ts` - Contract ABI
- `src/lib/allocation.ts` - Pure bigint BPS math (vitest tested)
- `src/lib/validation.ts` - Client-side input validation
- `src/lib/history.ts` - Chunked getLogs reader (2,000 blocks/call, from deploy block)
- `src/lib/share.ts` - getShareBase / buildShareLink / installShareSync
- `src/abi/SplitDistributorArtifact.ts` - AUTO-GENERATED embedded artifact (ABI + bytecode + keccak256). Run `bun run export:artifact` after recompiling.
- `scripts/export-artifact.ts` - regenerates SplitDistributorArtifact.ts from contracts/out
- `src/pages/Deploy.tsx` - /deploy page: browser-wallet deployment of SplitDistributor to active network
- `src/lib/artifact.test.ts` - vitest test asserting embedded bytecode keccak256
- `src/lib/utils.ts` - cn, formatAddress, formatTimestamp, explorer link builders
- `src/hooks/useDistributionHistory.ts` - React hook over fetchHistory
- `contracts/SplitDistributor.sol` - Core split distribution contract
- `contracts/test/` - Foundry test suite (40 tests, max preset)
- `docs/splitdistributor-report.md` - Full security review + test report

### ScheduledSplit

| Field | Value |
|---|---|
| Network | Arc Testnet (Chain ID 5042002) |
| Address | `0xf43192c85c5888c7b01fe7257efb80f6de2e17d6` |
| Deploy tx | `0x74794a12a72da408b533c7cb167850d90d6e6e4a0c92a01ed47f218cc8cdea14` |
| Deploy block | `69445979` |
| Explorer | https://explorer.testnet.arc.io/address/0xf43192c85c5888c7b01fe7257efb80f6de2e17d6 |
| Constructor arg | `usdc_ = 0x3600000000000000000000000000000000000000` (Arc Testnet official USDC) |
| ABI / artifact | `contracts/out/ScheduledSplit.sol/ScheduledSplit.json` |
| Embedded artifact | `src/abi/ScheduledSplitArtifact.ts` |
| Metadata | `contracts/contract-metadata/ScheduledSplit.json` |

## Deploy blocks

- SplitDistributor: **69249404** (tx `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd`)
- ScheduledSplit: **69445979** (tx `0x74794a12a72da408b533c7cb167850d90d6e6e4a0c92a01ed47f218cc8cdea14`)

## Security review notes

### SplitDistributor
- Max preset: two rounds of audit (solidity + functional), Slither, 40 unit tests, fuzz tests.
- Round 1 fix: added empty-bps guard in `_computeAmounts` to prevent underflow panic from `previewAmounts`.
- Documented: one blocked USDC recipient reverts the whole distribution (intentional atomic design per spec).
- Slither final: 0 findings.

### ScheduledSplit
- Max preset: concurrent solidity + functional audits, Slither, 69 unit tests (all pass), fuzz + invariant tests.
- Compiler: `via_ir = true` added to `foundry.toml` (required for `createSchedule` stack depth with 50 recipients).
- Audit findings: 1 High (cancel/execute ordering — permissionless by design, documented in NatSpec), 2 Medium (USDC blocklist atomic revert and contract-level freeze — inherent USDC trust assumptions, documented). All documented; no logic changes required.
- Slither: 0 Medium/High findings. 3 Low `timestamp` (inherent), 1 Informational `cyclomatic-complexity`.
- Gas benchmarks: `createSchedule(50 recipients, 24 payments)` = 2,014,393 gas. `execute(50 recipients)` first call = 1,320,090 gas; avg over 24 payments = 249,721 gas.

## Scheduled Payments Feature (complete)

- `src/pages/CreateSplit.tsx` — "Pay now" / "Schedule" mode selector; schedule steps: ScheduleForm → StepReview → StepScheduleApprove → StepScheduleCreate.
- `src/pages/Schedules.tsx` — `/schedules` page; lists user's created schedules by status (due, upcoming, completed, cancelled); inline execute + cancel.
- `src/pages/ScheduleDetail.tsx` — `/s/:id` public page; shows schedule details, payment history, "Pay now" button (anyone can trigger `execute()`).
- `src/components/create/ScheduleForm.tsx` — date/time picker, repeat mode, computed payment list, total deposit.
- `src/components/create/StepScheduleApprove.tsx` — approves exactly `totalDeposit` to ScheduledSplit.
- `src/components/create/StepScheduleCreate.tsx` — calls `createSchedule`, decodes `ScheduleCreated` event.
- `src/lib/schedule.ts` — `computeDueTimes`, `addInterval` (monthly clamp fixed), `formatCountdown`, `formatDueTime`, `selectUpcomingSchedules`.
- `src/lib/scheduleHistory.ts` — getLogs for ScheduleCreated/Executed/Cancelled events.
- `src/hooks/useScheduleHistory.ts` — enriched schedule list with live contract state.
- Layout nav now includes "Schedules".
- Dashboard "Upcoming payments" bento card added.
- `scripts/keeper.ts` — Bun+viem keeper bot; simulate-then-execute loop; exit 0 when nothing due; never logs private key.
- `.github/workflows/keeper.yml` — cron `*/5 * * * *` + `workflow_dispatch`; `oven-sh/setup-bun`; frozen lockfile; concurrency group.
- `docs/KEEPER.md` — keeper setup and operations guide.
- Vitest: 102/102 pass. Lint: 0 errors. Typecheck: 0 errors. `vite build`: success.

## To Run

```bash
bun install
bun run dev
```

## Arc Mainnet deployments (chain 5042, deployed by owner wallet 0xdF91…8c18 via /deploy)

| Contract | Address | Deploy tx | Deploy block |
|---|---|---|---|
| SplitDistributor | `0xb836ee72cddf83ab7df09db97f6f09507f46ff8f` | `0xeedb8919abb6c16405c604a31f4d94a2498e401b01c8508778b7e877942f5e33` | 28366986 |
| ScheduledSplit | `0x32ef22b2848c2161a075a2bfd4a74a3db3e362fb` | `0xd60939accbbf2cbeadd576542dfc9ce2bd345d3fd08c5f395776cd6d065a5e17` | 28367352 |

Verified by `scripts/verify-mainnet-txs.ts` (.github/workflows/verify-mainnet.yml). Proof txs: see `docs/MAINNET_PROOF.md`.
