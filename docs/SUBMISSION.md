# Split: hackathon submission (Arc Microgrants 2)

**Tagline:** One payment. Every contributor. Done.

**One-liner:** Split lets teams, DAOs, freelancers and businesses pay many people in USDC with one
transparent, atomic onchain transaction on Arc.

## Problem
Paying a team means many manual transfers, percentage spreadsheets, copy-pasted addresses and no
single record of who was paid what.

## Solution
Set recipients and percentages, review the exact amounts, approve the exact USDC total, and
distribute. The `SplitDistributor` contract pays every recipient in the same transaction. Either everyone
is paid or nothing moves. Every payout is a `Distributed` event that anyone can verify on the explorer.

## Built in Arc Studio
- Arc Studio project: https://studio.arc.io/app/767489e9-b81c-4ccf-a5df-94881d408a4d
- Generated through the Arc Studio CLI (`arc-studio run --session split`) and pulled with `arc-studio pull`.
- Prompts used, in order (full text in `arc-studio/prompts/`):
  1. `01-contract.md`: verify Arc network facts, write `SplitDistributor` per `docs/SPEC.md`, full Foundry suite, max-preset audit, deploy to Arc Testnet.
  2. `02-app.md`: the full web app (landing, dashboard, create/review/approve/distribute, receipt, activity, how it works).
  3. `03-fixes.md`: code-review fixes (mainnet chain config, env validation, chain-pinned reads, decoded errors, receipt timeouts, history paging).
  4. `04-testnet-proof.md`: an automated testnet proof. It stopped at a Circle API-key consent request, which was declined, and the owner runs the proof from their own wallet instead.
  5. `05-deploy-page.md`: the `/deploy` page, so the owner deploys to mainnet from their own wallet.
  6. `06-polish.md`: mainnet RPC override, honest RPC-error states, mobile navigation, editor usable before connecting.
  7. `07-editor.md`: an exact preview for invalid allocations, plus live field errors.
  8. `08-redesign.md`: full visual redesign (light bento layout, wine brand colour) and the new logo.
  9. `09-saved-recipients.md`: saved contacts and teams (stored on the device), loadable into any split.
  10. `10-scheduled-contract.md`: the `ScheduledSplit` contract (max preset, 69 tests, Slither), deployed to Arc Testnet.
  11. `11-scheduled-app-keeper.md`: scheduling UI, `/schedules`, the public `/s/:id` page and the keeper bot.
  12. `12-keeper-fixes.md`: keeper hardening (no unbounded scans or retries, log redaction, dry run, pinned workflow).
  13. `13-schedule-fixes.md`: monthly-date anchoring, a live future-time check, simulate-first, proper event decoding and chain guards.
- Outside Arc Studio: Arc Studio ran out of daily budget at the end of turn 8, so the logo SVG was traced by hand from `design/split-logo-source.jpg`, and the wallet-button and Arc Studio badge colours were set in `src/main.tsx`. No contract or transaction code was written outside Arc Studio.
- Also outside Arc Studio: after turn 10 the `via_ir` compiler setting was limited to `ScheduledSplit` (Arc Studio had enabled it for every contract), so that `SplitDistributor` keeps its tested testnet bytecode. Arc Studio ran out of daily budget partway through turn 13, so the remaining items were finished locally: typed ABI, the timezone-correct earliest-time picker, the shared Release-now helper with a chain guard, and the Deploy chain guard. No contract source was written outside Arc Studio.
- Results: 109/109 Foundry tests (SplitDistributor 40 + ScheduledSplit 69, re-run locally), Slither 0 high/medium findings, 134/134 vitest tests.

## Contracts
| Network | Address | Deploy tx |
|---|---|---|
| Arc Testnet (5042002) · SplitDistributor | `0x43a159af83f4c836940e2e74c8a29ae677c39498` | `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd` |
| Arc Testnet (5042002) · ScheduledSplit | `0xf43192c85c5888c7b01fe7257efb80f6de2e17d6` | `0x74794a12a72da408b533c7cb167850d90d6e6e4a0c92a01ed47f218cc8cdea14` |
| Arc Mainnet (5042) | _not deployed yet_ | _—_ |

USDC: `0x3600000000000000000000000000000000000000` (ERC-20 view, 6 decimals; native gas token on Arc).

Example mainnet distribution tx: _none yet. Add only after a confirmed transaction._

## Tech
Solidity 0.8.28 · OpenZeppelin 5 (SafeERC20, ReentrancyGuard) · Foundry · React 18 · Vite · TypeScript ·
Tailwind · wagmi v2 · viem v2.

## Links
- Code: https://github.com/teevincscrypt/split
- Demo video: _add link_
- Live app: _add link after hosting_
