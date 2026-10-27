This turn: prove SplitDistributor end to end on Arc Testnet with real testnet USDC. Arc Testnet only — do not touch Arc Mainnet. Do not change contracts or app code; put any helper script under scripts/proof/ and commit its output as docs/testnet-proof.md.

Contract: 0x43a159af83f4c836940e2e74c8a29ae677c39498 (Arc Testnet), USDC 0x3600000000000000000000000000000000000000 (ERC-20 view, 6 decimals).

1. Bytecode check: read the deployed runtime bytecode with eth_getCode and compare with contracts/out/SplitDistributor.sol/SplitDistributor.json deployedBytecode (account for the immutable `usdc` slot). Read usdc(), MAX_RECIPIENTS(), BPS_DENOMINATOR(), distributionCount(). Report the result.
2. Use a testnet wallet you control (your developer-controlled / deployer wallet, funded via the testnet faucet if needed). Never print private keys.
3. Distribution A — "Proof: 40/25/20/15": total 1.000000 USDC (1_000_000 units) to 4 freshly generated recipient addresses with bps [4000, 2500, 2000, 1500]. Steps: read payer balance + allowance; approve exactly 1_000_000 to the distributor; wait for the receipt; read allowance; call distribute; wait for the receipt.
4. Distribution B — "Proof: rounding": total 1_000_001 units to 3 fresh recipients with bps [3333, 3333, 3334]; expected amounts [333300, 333300, 333401].
5. For each distribution verify from chain data: receipt status, block number, block timestamp, the decoded Distributed event (id, payer, name, total, recipients, bps, amounts), each recipient's balance delta equals its amount exactly, the payer's balance delta equals −total, the distributor's USDC balance is 0 afterwards, and the allowance returns to 0.
6. Negative check: simulate (eth_call only, no tx) a distribute with bps summing to 9999 and confirm it reverts with InvalidAllocationTotal(9999).

Write docs/testnet-proof.md with a table per distribution: tx hashes (approve + distribute) with explorer links, block, timestamp, recipients, expected vs actual amounts, and PASS/FAIL per check. Report only what you observed onchain; if any step fails, report the failure exactly.
