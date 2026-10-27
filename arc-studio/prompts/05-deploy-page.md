Build the Deploy page you proposed, so the human owner can deploy SplitDistributor to Arc Mainnet from their own connected wallet. Do NOT deploy anything yourself and do not change the contract.

Requirements:
- Route /deploy (linked only from the How it works page under "Self-host / deploy", not in the main nav).
- Embed the compiled artifact in src/abi/SplitDistributorArtifact.ts (abi + creation bytecode from the current forge build — contracts/out is gitignored outside the sandbox, so the app must not import from it). Add a small script `bun run export:artifact` that regenerates that file from contracts/out, and a vitest test asserting the embedded bytecode keccak256 equals the value printed on the page.
- Target chain = ACTIVE_NETWORK (testnet or mainnet per VITE_SPLIT_NETWORK). Constructor arg = the official USDC address for that chain from onchain-facts, displayed and NOT editable.
- Show before signing: network name + chain id, deployer address (connected wallet), constructor arg, creation-bytecode keccak256, gas estimate (estimateGas for the deployment, "unavailable" if it fails), the deployer's native USDC gas balance, and on mainnet a prominent "This uses real USDC for gas and cannot be undone" notice. Require an explicit confirmation checkbox, and on mainnet also typing DEPLOY.
- Chain guard: if the wallet is on a different chain, show switch/add-chain and block the button.
- Deploy with walletClient.deployContract; show tx hash immediately with explorer link, wait for the receipt (timeout + "Check again"), and on success show the contractAddress from the receipt, block number, then verify onchain: getCode non-empty, usdc() equals the constructor arg, MAX_RECIPIENTS() == 50, distributionCount() == 0. Show each check PASS/FAIL.
- Then show the exact .env lines to use: VITE_SPLIT_NETWORK, VITE_SPLIT_DISTRIBUTOR_ADDRESS, VITE_SPLIT_DEPLOY_BLOCK (the receipt block number), with copy buttons.
- The page must work when VITE_SPLIT_DISTRIBUTOR_ADDRESS is not yet set (the rest of the app shows ContractNotConfigured, but /deploy must stay reachable).
- Same design system as the rest of the app.

Run vitest, typecheck, lint and build; report results.
