# Testnet proof

Confirmed Arc Testnet (chain 5042002) transactions made through the live app
(https://paywsplit.vercel.app) and the keeper bot. Each row was read back from the chain by
`scripts/rpc-probe.ts` (GitHub Actions run "RPC probe" #2, 2026-10-28).

## Instant distribution (SplitDistributor `0x43a159af83f4c836940e2e74c8a29ae677c39498`)

| # | Name | Tx | Block | Signed by |
|---|---|---|---|---|
| 1 | Team Salary | `0x42020273f1d9b620f8bc826d5b4e3767cedc3181e9a453b09a56f35110a5ee0e` | 69302577 | owner wallet, in the app |

## Scheduled payment released automatically (ScheduledSplit `0xf43192c85c5888c7b01fe7257efb80f6de2e17d6`)

| Schedule | Payment | Tx | Block | Executed by |
|---|---|---|---|---|
| #3 "Split Workers" | 1 of 1 | `0xd02e629c4c593bae2f5fcb749ec6c5eb88bd8599071bce493a5e6d852a1efdf3` | 69506790 | keeper bot `0xfA625C5a0964D189b6EF32D436A54d59f634c6a5` (GitHub Actions, triggered every minute by cron-job.org) |

The keeper's log for that run: `1 schedule(s) due: 3` → `Executed schedule #3: tx 0xd02e…1efdf3 (block 69506790)`.

Explorer: `https://explorer.testnet.arc.io/tx/<hash>`
