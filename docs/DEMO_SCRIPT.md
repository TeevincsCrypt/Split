# Demo video script (about 3 minutes)

**0:00 Hook (15s).** "Paying a team means many transfers, spreadsheets and copy-pasted addresses.
Split pays everyone in one move: one USDC transaction on Arc."

**0:15 Built in Arc Studio (40s).** Open the Arc Studio project
(https://studio.arc.io/app/767489e9-b81c-4ccf-a5df-94881d408a4d).
- Scroll the chat: the contract spec prompt, then the max-preset audit (40 Foundry tests, Slither clean).
- Show `contracts/SplitDistributor.sol` in the Arc Studio code panel and the testnet deployment.
- In a terminal, briefly show `arc-studio run --session split …` and `arc-studio pull`. This is how the code reached GitHub.

**0:55 Product walkthrough (80s).** In the app:
1. Landing page → **Create a split**. Connect your wallet; show the address, USDC balance and network badge.
2. Name "October Contributor Payout", 100 USDC (or a smaller real amount), and four recipients at 40/25/20/15.
   Show the live amounts, then type 39% to show the validation error and fix it back.
3. **Review**: every address, percentage and exact amount, plus network, gas estimate and the irreversible notice. Confirm.
4. **Approve** the exact amount (point out that it isn't unlimited). Wait for confirmation.
5. **Distribute**: tx hash appears → pending → confirmed.

**2:15 Proof (30s).** The receipt page shows block, timestamp and per-recipient amounts. Open the explorer and show the
four transfers and the `Distributed` event. Show **Activity** listing the distribution.

**2:45 Close (15s).** "Non-custodial, atomic, ownerless, and every payout verifiable onchain. Split, built in Arc Studio,
live on Arc mainnet." Show the mainnet contract address on the explorer.

Record the product walkthrough on **mainnet** with a small real amount, once it's deployed.
