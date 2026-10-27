UI review from screenshots (desktop 1440px and mobile 390px). Fix these; do not change the contract.

1. Mainnet RPC: a public source says https://rpc.mainnet.arc.io may be permissioned. Add an optional VITE_SPLIT_RPC_URL that, when set, overrides the RPC used by every public client / wagmi transport for the active network (outside the Arc Studio proxy). Document it in .env.example (empty by default) and validate it is an https URL.
2. RPC failure honesty: when the RPC cannot be reached (getBlockNumber/getLogs fail), Activity, Dashboard and Receipt currently show "No distributions yet." That is misleading. Show a distinct error state ("Couldn't reach the Arc RPC — history unavailable", with Retry) and keep "No distributions yet." only for a successful scan that found nothing. Dashboard metrics must show "Unavailable" in that case, not 0.
3. Mobile navigation: below the md breakpoint the nav links (Dashboard, Create split, Activity, How it works) disappear and there is no menu. Add an accessible mobile menu (button with aria-expanded, closes on route change/Escape). Also show the nav links on the landing page header on desktop.
4. The fixed "Built with Arc Studio" badge overlaps the footer disclaimer on mobile. Keep the badge (it is required), but add bottom padding to the footer/page on small screens so nothing is covered.
5. Create split: let visitors use the editor (name, amount, recipients, live summary, validation) without a connected wallet; require the wallet only when moving to Review. Show the "Connect wallet to continue" prompt at that point.
6. Landing "Set the percentages" uses a search icon; use a percent/sliders icon.

Then run vitest, typecheck, lint and build; report results.
