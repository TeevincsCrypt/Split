Redesign the whole Split site (landing + every app page) to a new visual direction and a new logo. Do not change the contract, the transaction logic, validation, or any data source. This is a visual/layout redesign only.

Inputs:
- context/design-inspiration.jpg: layout and style inspiration (a light "bento" finance dashboard). Copy its design language, not its content or its fake numbers.
- public/brand/split-logo-source.jpg: the new Split logo (small JPG on a pink grid background; do not ship this file in the UI).

1. Logo. Redraw the logo as a clean vector `public/brand/split-mark.svg` (and a `SplitMark` React component that uses currentColor). Shape: a bold, geometric "S" built from three straight bands and two diagonal terminals, solid fill #641532:
   - a short vertical bar on the left (upper half) and a short vertical bar on the right (lower half), joined by a horizontal middle bar, forming a squared-off S spine;
   - the top terminal is a thick diagonal band rising from the top of the left bar up and to the right at about 45°, ending in a fully rounded cap;
   - the bottom terminal mirrors it: a thick diagonal band from a rounded cap on the lower left rising up and to the right into the bottom of the right bar;
   - uniform stroke thickness, no outline, transparent background, viewBox about 0 0 100 120.
   Compare your SVG against the source image and refine until the silhouette matches. Use it in the header (mark + "Split" wordmark), footer, favicon (`index.html`, SVG favicon + 32px PNG), transaction dialogs, the receipt and the Deploy page. Remove the old teal mark everywhere.

2. Design system (replace the dark theme tokens in src/index.css; sweep hardcoded colors such as #0d1b2f, rgba(100,217,192,...), rgba(232,109,122,...), text-green-400/yellow-300 in every component, including the create steps and Deploy):
   - Light theme. Page background #F3F2F1 (warm off-white), top band/hero slightly lighter; cards pure white with 28–32px radius, no heavy borders (1px #ECEAE8 at most), very soft shadow.
   - Brand accent: the logo wine #641532 for primary buttons, active states and key numbers; tints for fills (#F7E9EE, #EBC9D5, #D99BB0), the same way the inspiration uses peach tints of its orange. Secondary dark pill buttons in near-black #111 with white text (like "Receive"). Ghost pills: white with 1px border.
   - Ink #141414, secondary text #6F6B68, subtle #A29E9A. Success #2F7D5B, warning #B7791F, danger #B4232C (pass WCAG AA on white).
   - Typography: a clean grotesk (e.g. "Inter Tight" or "Manrope" via Google Fonts) — large light/regular display sizes for headlines and big numbers (e.g. "$ 23,194.80" style with a smaller "$"), small 12–13px labels in secondary color. Tabular numerals for amounts.
   - Shape language from the inspiration: circular icon buttons (44px, white, subtle border), pill buttons with a trailing arrow, pill filter chips with ×, small dropdown pills, dot pagination, a circular progress ring, concentric-circle visual.
   - Restrained motion only (hover lift, ring fill on load). Respect prefers-reduced-motion.

3. Layout:
   - Header: rounded white bar inside the page margin. Left: menu circle (mobile), logo mark + "Split" / small subtitle "USDC payouts on Arc"; center/right: nav pills (Dashboard, Create split, Activity, How it works); right: wallet button as a pill showing the network dot + short address, or "Connect wallet".
   - Landing: a hero band like the inspiration's top section: left a big circular tile reading "1 tx" with a small "→ every contributor" caption (echoing the inspiration's date tile) and the primary pill CTA "Create a split →" plus ghost "Explore activity"; right the headline "Pay everyone. In one move." with the supporting line in lighter gray beneath it. Below, a bento grid of cards explaining the product with clearly illustrative content (label each "Example" — never present it as live data): a "One payment → four recipients" card with a 100 USDC example and 40/25/20/15 rows; a concentric-circles card showing the 40/25/20/15 shares; the 4-step "How it works" as a vertical stepper card (like "Business plans"); a "Non-custodial · atomic · ownerless" card with a circular ring icon; a "Verify onchain" card linking to the testnet contract on the explorer. No fake balances, revenue, growth rates or user counts.
   - Dashboard: bento grid of real data cards — USDC balance (big number), native gas balance, network status card with a lock/ring icon, confirmed total distributed and count (show "—" / "Unavailable" exactly as today when there is no data or RPC fails), recent distributions list card with filter chips, and a "Create a split" CTA card. Keep every existing state (disconnected, wrong network, loading, empty, RPC error).
   - Create split: keep the 4-step flow; restyle the step indicator as dot/pill pagination, recipient rows as white rounded cards with an inline percent pill and amount on the right, the live summary as a card with a concentric-circle or ring visual of allocated %. Review/Approve/Distribute/Receipt as large white cards with big amount typography.
   - Activity, Receipt, How it works, Deploy, footer: same system. Keep the "Built with Arc Studio" badge, restyled to fit (white pill, small mark), and keep the mobile footer padding so it never covers content.
   - Responsive: bento collapses to 1 column under 640px, 2 columns under 1024px; no horizontal scroll at 360px.

Then run vitest, typecheck, lint and build, and report results.
