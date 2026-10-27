New contract: ScheduledSplit (max preset — full audit + tests). Implement exactly context/docs/SPEC-SCHEDULED.md, sections "Contract: ScheduledSplit" and "Tests". Do not modify SplitDistributor.sol or its tests.

1. contracts/ScheduledSplit.sol — Solidity 0.8.28, OpenZeppelin SafeERC20 + ReentrancyGuard, custom errors, NatSpec. Reuse the exact SplitDistributor validation and rounding rules (factor them into an internal library only if it does not change SplitDistributor's bytecode; otherwise duplicate them).
2. Foundry tests under contracts/test/ScheduledSplit.*.t.sol covering every case in the SPEC test list, including the balance == sum(remainingDeposit) invariant test and fuzzing; use vm.warp for time.
3. Run forge build and forge test; fix failures; report real counts and the gas for createSchedule and execute at 50 recipients × 24 payments.
4. Audit (reentrancy, time manipulation tolerance, griefing via execute, cancel/execute races in the same block, rounding, USDC blocklist on one recipient blocking a schedule — document how the payer recovers via cancel), fix findings, run Slither.
5. Deploy ScheduledSplit to Arc Testnet with the official Arc Testnet USDC as constructor arg. Report address, tx hash, deploy block. Do NOT deploy to mainnet.
6. Export the artifact for the app the same way as SplitDistributor (src/abi/ScheduledSplitArtifact.ts + keccak test) so /deploy can deploy it from the owner's wallet later.
