# Split — USDC Payment Splitter

One payment. Every contributor. Done.

Split lets teams, DAOs, freelancers, and businesses distribute USDC to multiple recipients in one transparent, onchain transaction. The payer approves the total once; the contract distributes to every recipient atomically.

Built with [Arc Studio](https://studio.arc.io)

---

## Tech stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS
- **Web3:** wagmi v2, viem v2, ConnectKit
- **Contracts:** Solidity 0.8.28, Foundry, OpenZeppelin 5.6.1
- **Chain:** Arc Testnet / Arc Mainnet (USDC as native gas token)
- **Token:** USDC (ERC-20, 6 decimals)

---

## Development

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Foundry](https://book.getfoundry.sh) (`forge`, `cast`)
- Node.js (for the Circle CLI, not for app dev)

### Install

```bash
bun install
```

### Environment variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Purpose | Required |
|---|---|---|
| `VITE_SPLIT_NETWORK` | `"testnet"` or `"mainnet"` | Yes (default: `testnet`) |
| `VITE_SPLIT_DISTRIBUTOR_ADDRESS` | Deployed `SplitDistributor` address | Yes |
| `VITE_SPLIT_DEPLOY_BLOCK` | Deploy block for event indexing | Yes |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy (optional outside Arc Studio) | Optional |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy auth token | Optional |
| `RPC_PROXY_CHAINS` | Comma-separated proxy chain keys | Optional |

### Run (frontend dev server)

```bash
bun run dev
```

### Build (contracts)

```bash
bun run contracts:build
# or: forge build
```

### Test (contracts)

```bash
bun run contracts:test
# or: forge test -vv
```

40 tests, 0 failed. Includes fuzz tests and a gas benchmark at MAX_RECIPIENTS (50 recipients = 1,817,800 gas).

### Test (frontend unit tests)

```bash
bun run test
```

23 vitest tests for `src/lib/allocation.ts` — pure bigint math, percent/BPS conversions, formatting.

---

## Deployed contracts

| Contract | Network | Address |
|---|---|---|
| `SplitDistributor` | Arc Testnet | `0x43a159af83f4c836940e2e74c8a29ae677c39498` |

Explorer: https://explorer.testnet.arc.io/address/0x43a159af83f4c836940e2e74c8a29ae677c39498

---

## Security

A max-preset review (two audit rounds, Slither, 40 unit tests, fuzz tests) was run before deployment. See `docs/splitdistributor-report.md` for the full report.

**This is not a substitute for a paid third-party audit before deploying to mainnet with real user funds.**
