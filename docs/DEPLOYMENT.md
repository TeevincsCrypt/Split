# Deployment guide

Split was generated and tested in Arc Studio. Arc Studio deployed the **testnet** contract.
The **mainnet** contract has to be deployed by the project owner from their own wallet. Arc Studio's
built-in deployer is testnet-only and uses a shared platform wallet.

> ⚠️ Mainnet transactions use real USDC (for gas and payouts) and can't be undone.

## 0. Run the app on your computer

You need [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`) and Git.

```bash
git clone https://github.com/teevincscrypt/split.git
cd split
git checkout claude/arc-studio-cli-setup-mlisfu
cp .env.example .env          # testnet values are pre-filled
bun install
bun run dev                   # open the printed http://localhost:5173 link
```

## 1. Testnet proof (do this first)

The testnet contract is already deployed (by Arc Studio):

| | |
|---|---|
| Network | Arc Testnet, chain ID 5042002 |
| SplitDistributor | `0x43a159af83f4c836940e2e74c8a29ae677c39498` |
| Deploy tx | `0xa01d2a87258d79122d210787029bd968b18f874cc11dd0d2f978e23d53f595dd` |
| Deploy block | 69249404 |
| USDC (ERC-20) | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Explorer | https://explorer.testnet.arc.io/address/0x43a159af83f4c836940e2e74c8a29ae677c39498 |

1. Open the app and click **Connect**. If your wallet is on a different network, use the banner's
   **Switch network** button. It adds Arc Testnet to your wallet.
2. Get free testnet USDC from the Circle faucet (https://faucet.circle.com, choose Arc Testnet).
   Testnet USDC also pays for testnet gas.
3. Go to **Create a split**. Enter a name (e.g. "Testnet proof 40/25/20/15"), a total of 1 USDC, and four
   recipient addresses you control (a wallet can create extra accounts), using 40/25/20/15.
4. **Review** → tick the confirmation → **Approve USDC** (exact amount) → **Distribute**.
5. When the receipt page opens, copy the transaction hash and check it on the explorer.
   Paste the hash into `docs/TESTNET_PROOF.md`.
6. Optional rounding check: 1.000001 USDC across three recipients at 33.33 / 33.33 / 33.34.

## 2. Mainnet deploy (requires owner approval — real USDC)

1. Put a small amount of USDC on Arc Mainnet in your wallet, enough for deployment gas. The Deploy page
   shows the gas estimate before you sign.
2. In `.env` set `VITE_SPLIT_NETWORK=mainnet` and **remove** `VITE_SPLIT_DISTRIBUTOR_ADDRESS` and
   `VITE_SPLIT_DEPLOY_BLOCK`. If the public mainnet RPC refuses requests, also set
   `VITE_SPLIT_RPC_URL` to a provider endpoint.
3. `bun run dev`, then open `http://localhost:5173/deploy`.
4. Check the network (Arc, chain 5042), the constructor argument (official USDC `0x3600…0000`) and the
   bytecode hash. Tick the box, type `DEPLOY`, and sign in your wallet.
5. Wait for the onchain checks to show PASS. Copy the three `.env` lines the page shows into `.env`,
   then restart `bun run dev`.
6. Run one small real distribution (e.g. 1 USDC) through the app and keep the receipt link and tx hash.
7. Record the address, deploy tx and example tx in `README.md` and `docs/SUBMISSION.md`.

## 3. Hosting on Vercel

`vercel.json` is already set up. It uses Bun to install and build, serves `dist/`, sends every path to
`index.html` so `/d/:id` receipt links work, and blocks other sites from embedding the app (anti-clickjacking).

1. Go to https://vercel.com/new and **Import** the GitHub repo `teevincscrypt/split`.
   Leave the build settings alone; `vercel.json` supplies them.
2. Under **Environment Variables**, add:

   | Name | Testnet value |
   |---|---|
   | `VITE_SPLIT_NETWORK` | `testnet` |
   | `VITE_SPLIT_DISTRIBUTOR_ADDRESS` | `0x43a159af83f4c836940e2e74c8a29ae677c39498` |
   | `VITE_SPLIT_DEPLOY_BLOCK` | `69249404` |
   | `VITE_SPLIT_RPC_URL` | leave empty unless the public RPC fails |
   | `VITE_SCHEDULED_SPLIT_ADDRESS` | `0xf43192c85c5888c7b01fe7257efb80f6de2e17d6` |
   | `VITE_SCHEDULED_SPLIT_DEPLOY_BLOCK` | `69445979` |

3. Click **Deploy**. These values are compiled into the site, so **change a variable → Redeploy**.
4. Vercel's production site follows the `main` branch. Either merge
   `claude/arc-studio-cli-setup-mlisfu` into `main`, or set **Settings → Git → Production Branch** to that branch.
   Every other branch gets its own preview URL.
5. **After the mainnet deploy:** change the variables to `mainnet`, the new address and the new deploy block,
   then **Redeploy**. Open `/deploy` on your own machine (`bun run dev`), not on the public site.
6. The live site is https://paywsplit.vercel.app (linked from `README.md` and `docs/SUBMISSION.md`).
