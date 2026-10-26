Project: Split — a USDC payment-splitting app on Arc. Read context/docs/SPEC.md first; section 1 is the exact contract spec you must implement.

This turn: contracts only (max preset — full audit + tests).

1. Before writing code, state from your loaded Arc/Circle documentation (quote the source page/section): Arc Testnet and Arc Mainnet chain IDs, public RPC URLs, native gas token and its decimals, the official USDC ERC-20 address and decimals on each network, block explorer URLs, and any caveats about USDC being both the native gas token and an ERC-20 (e.g. 18 vs 6 decimals). If something is not in your docs, say so — do not guess.
2. Implement contracts/SplitDistributor.sol exactly per SPEC section 1 using OpenZeppelin (SafeERC20, ReentrancyGuard), a stable Solidity 0.8.x version, custom errors and NatSpec.
3. Write a Foundry test suite covering every case listed in the SPEC "Tests" section, including fuzz tests and a gas measurement that justifies MAX_RECIPIENTS. Keep mock tokens strictly in test/.
4. Run `forge build` and `forge test -vv` and fix every failure. Report the real test output summary (number passed/failed) and the gas figure for a MAX_RECIPIENTS distribution.
5. Audit the contract (reentrancy, rounding, griefing, USDC blocklist behaviour, event correctness, the native/ERC-20 dual nature of USDC on Arc) and fix any issue you find.
6. Deploy SplitDistributor to Arc Testnet with the constructor argument set to the official Arc Testnet USDC address. Report the address, deploy tx hash and explorer link.
7. Do NOT deploy anything to Arc Mainnet.

Finish with: the network facts table, test summary, gas numbers, audit findings, and the testnet deployment.
