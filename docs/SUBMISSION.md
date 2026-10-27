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
- Arc Studio results: 40/40 Foundry tests (re-run independently: 40 passed), Slither 0 findings, 36/36 vitest tests.

## Contracts
| Network | Address | Deploy tx |
|---|---|---|
| Arc Testnet (5042002) | `0x43a159af83f4c836940e2e74c8a29ae677c39498` | `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd` |
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
