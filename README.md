# Split

**One payment. Every contributor. Done.**

Split lets teams, project owners, DAOs, freelancers and businesses distribute USDC to many
recipients in one transparent, atomic onchain transaction on [Arc](https://arc.io).

**Live app:** https://paywsplit.vercel.app

> **Built in Arc Studio:** https://studio.arc.io/app/767489e9-b81c-4ccf-a5df-94881d408a4d
> The contracts and app were generated with the Arc Studio CLI (`arc-studio run --session split`) and
> pulled into this repo with `arc-studio pull`. Every prompt is in [`arc-studio/prompts/`](arc-studio/prompts).

## The problem
Paying a team by hand means many separate transfers, percentage maths, copy-pasted
addresses and no single record of who was paid.

## How Split works
1. **Define your recipients.** Add a label and wallet address for each person.
2. **Set the percentages.** Live amounts are calculated in exact 6-decimal USDC units.
3. **Approve and distribute USDC.** You approve the exact total (never unlimited), then call `distribute`.
4. **Verify every payment onchain.** The receipt page and explorer show every transfer and the `Distributed` event.

For example, 100 USDC paid 40/25/20/15 sends 40, 25, 20 and 15 USDC in one transaction.

## Features
- Wallet connect (MetaMask, Rabby and other injected wallets), shortened address, USDC and gas balance, network check with switch/add-chain.
- Split editor with add/remove rows, an even-split helper, a live summary and strict validation that mirrors the contract.
- Review screen with every address and amount, the network, a gas estimate and an irreversibility notice, plus an explicit confirmation step.
- Exact-amount approval that waits for its receipt and re-reads the allowance.
- Distribution flow that simulates first, then shows the tx hash, a pending state, the receipt and decoded revert reasons. A timeout is reported as "submitted, not confirmed".
- Receipt page `/d/:id` built from chain data (event, receipt, block timestamp), with a shareable link.
- Activity and Dashboard read directly from onchain `Distributed` events. There is no backend or database.
- `/deploy` page so the owner can deploy the contract from their own wallet.

## Architecture
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), which includes a diagram.

- **Contract** [`contracts/SplitDistributor.sol`](contracts/SplitDistributor.sol): ownerless and non-custodial. It calls
  `safeTransferFrom(payer → recipient)` for each recipient, so it never holds funds. Calls are atomic and `nonReentrant`. USDC is pinned
  as an `immutable`. Allocations are in basis points, with the rounding remainder going to the last recipient. `MAX_RECIPIENTS = 50`
  (about 1.82M gas at 50 recipients).
- **App** (`src/`): React 18 + Vite + TypeScript + Tailwind + wagmi v2 + viem v2.

## Arc network configuration

| | Arc Testnet | Arc Mainnet |
|---|---|---|
| Chain ID | 5042002 | 5042 |
| RPC | https://rpc.testnet.arc.io | https://rpc.mainnet.arc.io |
| Gas token | USDC | USDC |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` (6 decimals) | same |
| Explorer | https://explorer.testnet.arc.io | https://explorer.arc.io |

Source: Arc Studio's onchain registry (`src/onchain-facts.ts`). On Arc, USDC is both the native gas token
(18-decimal view) and an ERC-20 (6-decimal view) over one balance. Split uses only the ERC-20 view.

## Deployments

| Network | SplitDistributor | Deploy tx | Deployed by |
|---|---|---|---|
| Arc Testnet | [`0x43a159af83f4c836940e2e74c8a29ae677c39498`](https://explorer.testnet.arc.io/address/0x43a159af83f4c836940e2e74c8a29ae677c39498) | `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd` (block 69249404) | Arc Studio |
| Arc Mainnet | **Not deployed yet** | — | Project owner via `/deploy` |

Example confirmed distribution: _none recorded yet_ (see [`docs/TESTNET_PROOF.md`](docs/TESTNET_PROOF.md)).

## Local setup

```bash
bun install
cp .env.example .env
bun run dev
```

| Variable | Purpose |
|---|---|
| `VITE_SPLIT_NETWORK` | `testnet` or `mainnet`. Any other value is a configuration error. |
| `VITE_SPLIT_DISTRIBUTOR_ADDRESS` | Deployed SplitDistributor on that network |
| `VITE_SPLIT_DEPLOY_BLOCK` | Block to start reading events from |
| `VITE_SPLIT_RPC_URL` | Optional https RPC override (e.g. a provider endpoint if the public RPC is restricted) |

These are public values; no secrets belong in `.env` for the frontend.

## Testing

```bash
forge test        # 40 contract tests (unit, revert, reentrancy, fuzz, gas)
bun run test      # 36 vitest tests (allocation + embedded-bytecode hash)
bun run lint
bun run build     # typecheck + production build
```

## Deploying
See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). The mainnet deploy is signed by the owner's own wallet on the
`/deploy` page, so no private key is ever pasted anywhere.

## Security and limitations
See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/splitdistributor-report.md`](docs/splitdistributor-report.md).
- Not audited by a third party. Only the AI audit inside Arc Studio (plus Slither) was done.
- One USDC-blocklisted recipient makes the whole distribution revert (all-or-nothing by design).
- History is read from RPC logs in windows. It may be partial if the RPC limits ranges, and the UI says so.
- The optional description field is kept in the browser only. The split name is stored onchain in the event.
- Blockchain transactions are generally irreversible.

## Submission material
[`docs/SUBMISSION.md`](docs/SUBMISSION.md) · [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) · [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)
