This turn: build the Split web app on top of the SplitDistributor contract you deployed to Arc Testnet in the previous turn. Re-read context/docs/SPEC.md section 2. Do not change the contract.

Deployed testnet contract (from your previous turn): SplitDistributor at 0x43a159af83f4c836940e2e74c8a29ae677c39498, deploy tx 0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd. Read the deploy block number from that receipt and use it as VITE_SPLIT_DEPLOY_BLOCK in .env.example. Also set the sandbox .env so the live preview runs on Arc Testnet against this contract.

Product: Split — "One payment. Every contributor. Done." Real USDC payouts to many recipients in one atomic onchain transaction.

Stack: the sandbox's Vite + React + TypeScript + Tailwind, wagmi v2 + viem, injected wallets (MetaMask/Rabby). Client-side routing. No backend, no database — the chain is the source of truth.

Structure (keep it separated):
- src/config/networks.ts — Arc Testnet and Arc Mainnet definitions (chain id, RPC, explorer, USDC address, decimals) from your verified docs; active network chosen by VITE_SPLIT_NETWORK ("testnet" | "mainnet") and the SplitDistributor address by VITE_SPLIT_DISTRIBUTOR_ADDRESS (+ VITE_SPLIT_DEPLOY_BLOCK for log scanning). If the address env var is missing, show a clear "contract not configured" state — never fall back to another chain or a guessed address. Commit a .env.example (no secrets) with the testnet values.
- src/abi/ — SplitDistributor ABI (from the compiled artifact) and minimal ERC-20 ABI.
- src/lib/allocation.ts — pure bigint math mirroring the contract exactly (bps, floor, remainder to last recipient), percent-string → bps parsing (max 2 decimals), USDC amount parsing with parseUnits(…, 6) and rejection of >6 decimals / negative / non-numeric input. Add vitest unit tests for it, including the 40/25/20/15 example and remainder cases, and run them.
- src/lib/validation.ts — same rules as the contract (1..MAX_RECIPIENTS, valid checksummed address, no zero/self/token address, no duplicates case-insensitive, bps > 0, sum exactly 10000, amount > 0, each computed amount > 0, name 1–64 bytes).
- src/lib/history.ts — read Distributed events via getLogs in block-range chunks from VITE_SPLIT_DEPLOY_BLOCK, plus block timestamps; filter by payer and by distribution id. If the RPC limits the range, show what was loaded and say history may be partial.
- src/components, src/pages.

Pages:
1. Landing: hero "Pay everyone. In one move." with the supporting copy "Split turns team payouts into one transparent USDC transaction. Set the percentages, review the distribution, and pay every contributor onchain." CTAs "Create a split" and "Explore activity". A clean visual of one payment fanning out to 4 recipients (illustrative, clearly not live data). "How it works": 1 Define your recipients, 2 Set the percentages, 3 Approve and distribute USDC, 4 Verify every payment onchain. No claims about fees, speed, adoption or audits.
2. Dashboard: wallet, USDC balance, native gas balance, network status, confirmed total distributed and count by the connected payer (from events), recent distributions, Create CTA. Show "—"/empty states when no data.
3. Create split: name, optional description (UI only, not onchain), amount, recipient rows (label, address, %, live USDC amount), add/remove rows, "split evenly" helper, live summary (total, count, allocated %, allocated USDC, remaining, errors). Prefill nothing but offer an "Example: 40/25/20/15" button that fills labels/percentages only (no addresses).
4. Review step: everything listed, network name, gas estimate (estimateContractGas, show "unavailable" on failure), irreversibility notice, explicit confirm checkbox.
5. Approve step: read balance + allowance; if allowance < total, explain why approval is needed and approve exactly `total` (no unlimited); wait for the receipt, re-read allowance; continue only when sufficient.
6. Distribute: simulateContract first (surface revert reason), writeContract, show tx hash immediately, pending state, waitForTransactionReceipt, detect user rejection / revert / timeout (keep "submitted, not yet confirmed" with explorer link — never claim success), success only after receipt status success and parsing the Distributed event from that receipt. Disable buttons while pending.
7. Receipt / details /d/:id: from the onchain event + receipt + block timestamp: name, payer, total, recipients, % and amounts, tx hash (copy button), block, timestamp, explorer links, status. Shareable URL.
8. Activity: confirmed distributions list with filters (payer, id), explorer links, partial-history note.
9. How it works / About: non-custodial atomic flow, network, rounding policy, limits (MAX_RECIPIENTS, history via RPC logs), irreversibility.
Footer: GitHub https://github.com/teevincscrypt/split, How it works link, Arc explorer link, disclaimer "Blockchain transactions are generally irreversible."

Wallet UX: connect/disconnect, shortened address, wrong-network banner with switch/add chain (wallet_addEthereumChain), wallet missing message, rejected tx message. Never ask for seed phrases or private keys.

Design: dark-first, neutral surfaces (near-black, zinc), one accent (e.g. a calm mint/teal), subtle borders and shadows, excellent typography (Inter or similar), generous spacing, restrained motion, responsive down to 360px. Simple "Split" wordmark (two offset strokes or a split circle) used in header, favicon and dialogs. Avoid heavy gradients, glassmorphism, cartoon art.

Then run `npm run build`, typecheck and lint, and the vitest tests; fix all errors. Report results honestly.
