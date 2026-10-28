# Mainnet proof

Arc Mainnet (chain 5042) deployments and real-USDC transactions, made by the project owner through the
live app (https://paywsplit.vercel.app) and the keeper bot. Every row below was read back from the chain by
`scripts/verify-mainnet-txs.ts` (GitHub Actions "Verify mainnet txs" runs #1–#3, 2026-10-28). That script
uses no keys and sends nothing.

## Contracts (deployed by the owner wallet `0xdF9124Ed99aD229af02FE3aaB06B6384d07b8c18`)

| Contract | Address | Deploy tx | Block |
|---|---|---|---|
| SplitDistributor | [`0xb836ee72cddf83ab7df09db97f6f09507f46ff8f`](https://explorer.arc.io/address/0xb836ee72cddf83ab7df09db97f6f09507f46ff8f) | `0xeedb8919abb6c16405c604a31f4d94a2498e401b01c8508778b7e877942f5e33` | 28366986 |
| ScheduledSplit | [`0x32ef22b2848c2161a075a2bfd4a74a3db3e362fb`](https://explorer.arc.io/address/0x32ef22b2848c2161a075a2bfd4a74a3db3e362fb) | `0xd60939accbbf2cbeadd576542dfc9ce2bd345d3fd08c5f395776cd6d065a5e17` | 28367352 |

Checks on both contracts:
- The onchain runtime code matches the Arc Studio artifact embedded in the app. The only allowed difference
  is the immutable USDC address.
- `usdc()` = `0x3600000000000000000000000000000000000000`, which is official USDC.
- `MAX_RECIPIENTS()` = 50.

## Instant distribution (Pay now)

| # | Name | Tx | Block | Time (UTC) |
|---|---|---|---|---|
| 1 | Split workers | `0x082c1175335f8d17b77f40cc84faa240dde7b89056b95b632f63d50a5a5db0a4` | 28369306 | 2026-10-28 21:25:29 |

Event `Distributed`: 0.50 USDC total, split 50/50 (0.25 USDC each) between `0x1041…16c1` and `0xfA62…c6a5`.
Payer: the owner wallet.

## Scheduled payment released automatically

| Schedule | Payment | Tx | Block | Due → executed (UTC) | Executed by |
|---|---|---|---|---|---|
| #1 | 1 of 1 | `0xe358f7e6fa1cffb071279f32f41472ceb703c5124597e6621177808eb3bcde44` | 28369980 | 21:31:00 → 21:31:11 | keeper bot `0xfA625C5a0964D189b6EF32D436A54d59f634c6a5` |

Event `ScheduledPaymentExecuted`: 0.25 USDC paid to each of the two recipients.

Explorer: `https://explorer.arc.io/tx/<hash>`
