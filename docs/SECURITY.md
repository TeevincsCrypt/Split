# Security and testing checklist

Status legend: ✅ done with evidence · ⏳ pending · ⚠️ known limitation

## Contract

| Check | Status | Evidence |
|---|---|---|
| Recipient and bps array lengths must match; 1–50 recipients | ✅ | `LengthMismatch`, `NoRecipients`, `TooManyRecipients` + tests |
| Zero, self and token addresses rejected as recipients | ✅ | `InvalidRecipient` + tests |
| Duplicate recipients rejected | ✅ | `DuplicateRecipient` + test |
| Zero total rejected | ✅ | `ZeroAmount` + test |
| Each bps > 0 and the bps sum to exactly 10 000 | ✅ | `ZeroAllocation`, `InvalidAllocationTotal` + tests (9999 / 10001) |
| No recipient silently gets 0 | ✅ | `AllocationRoundsToZero` + test |
| Amounts sum exactly to the total | ✅ | 4 fuzz tests × 256 runs |
| Reentrancy | ✅ | `nonReentrant`; reentrant mock-token tests |
| Token returning false / reverting | ✅ | SafeERC20; mock tests |
| Insufficient allowance / balance revert the whole call | ✅ | tests |
| Contract holds zero USDC after every call | ✅ | test |
| Event emitted only on success, with full payout data | ✅ | emitted after the transfers; event tests |
| Token pinned; users can't pass a token address | ✅ | `immutable usdc`; constructor rejects zero or codeless addresses |
| No owner, admin or withdraw function | ✅ | source review |
| Static analysis | ✅ | Slither: 0 findings (Arc Studio run, `docs/splitdistributor-report.md`) |
| Independent test re-run | ✅ | `forge test` run locally: 40 passed, 0 failed |
| External audit | ⚠️ | Not audited by a third party. Only the AI audit inside Arc Studio was done. |
| USDC-blocklisted recipient | ⚠️ | Reverts the whole distribution (intentional, all-or-nothing). |

## App

| Check | Status |
|---|---|
| bigint/bps math only; no float as the source of truth (`parseUnits(…, 6)`) | ✅ |
| Input with more than 6 decimals, negative or non-numeric is rejected | ✅ (vitest) |
| Exact-amount approval, never unlimited | ✅ |
| Allowance re-read after the approval receipt before continuing | ✅ |
| Simulation before sending; decoded custom-error messages | ✅ |
| Success only after a receipt with `status=success` and a decoded `Distributed` event | ✅ |
| Timeout shows "submitted, not confirmed" plus explorer link and a re-check | ✅ |
| Wrong-network guard; reads pinned to the active Arc chain | ✅ |
| Unknown network or invalid contract address shows a configuration error, with no silent fallback | ✅ |
| No private keys or seed phrases requested; no secrets in the bundle | ✅ |
| Manual wallet test on Arc Testnet | ⏳ owner to run (see `DEPLOYMENT.md`) |
| History completeness | ⚠️ Reads RPC logs newest-first in windows ("Load older"). RPC limits may make it partial, and the UI says so. |

## Commands

```bash
forge test            # contracts (needs solc 0.8.28 + `bun install` for OpenZeppelin)
bun run test          # vitest tests
bun run lint
bun run build         # typecheck src/ + vite build
```
