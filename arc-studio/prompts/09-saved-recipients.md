Add "Saved recipients" to the Split app. App only; do not change any contract. Read context/docs/SPEC-SCHEDULED.md, section "Saved recipients".

Also note: since your last turn, two local fixes were made (keep them as they are): src/config/networks.ts now exposes ACTIVE_NETWORK.rpcUrls (ordered fallback list), src/config.ts and src/lib/history.ts use viem/wagmi fallback() transports over those URLs plus the connected wallet, and StepApprove shows Checking…/error + Retry when balance or allowance reads fail. The logo is public/brand/split-mark.svg and the SplitMark component in Layout.tsx — keep them.

Build:
1. src/lib/addressBook.ts — typed, versioned localStorage store (key "split.addressBook.v1"), every access in try/catch, pure helpers with vitest tests: add/update/remove contact (label 1–40 chars, checksummed address, no duplicate addresses), save/rename/delete team (name, rows of {label, address, bps}; reuse validation.ts rules), export to JSON, import with strict validation (reject malformed entries, report how many were skipped).
2. /recipients page (nav item "Recipients"): Contacts tab and Teams tab, cards in the current design system, add/edit/delete with confirmation, copy address, export/import buttons, empty states, and the notice "Saved on this device only — not stored onchain."
3. Create split editor: a "Load team" pill (opens a picker of saved teams → fills name suggestion, rows and percentages), an "Add from contacts" option per row (search by label/address), and "Save as team" after the split validates. Loading a team never overwrites the amount.
4. Mobile-friendly (sheet/modal on small screens), keyboard accessible.

Run vitest, typecheck, lint and build; report results.
