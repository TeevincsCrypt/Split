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

- `src/App.tsx` - Main application logic
- `contracts/SplitDistributor.sol` - Core split distribution contract
- `contracts/test/` - Foundry test suite (40 tests, max preset)
- `docs/splitdistributor-report.md` - Full security review + test report
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Security review notes

- Max preset: two rounds of audit (solidity + functional), Slither, 40 unit tests, fuzz tests.
- Round 1 fix: added empty-bps guard in `_computeAmounts` to prevent underflow panic from `previewAmounts`.
- Documented: one blocked USDC recipient reverts the whole distribution (intentional atomic design per spec).
- Slither final: 0 findings.

## To Run

```bash
bun install
bun run dev
```
