Browser test of the Create split editor found two issues. Fix them; do not change the contract.

1. Misleading preview amounts: with 100 USDC and bps [3900, 2500, 2000, 1500] (sum 9900) the last row shows 16.00 USDC, because computeAmounts gives the remainder to the last recipient even when the allocation is invalid. The live preview must only apply the remainder rule when sum(bps) == 10000. Otherwise show each row as floor(total * bps / 10000) and the summary must show the unallocated USDC amount explicitly. Add vitest cases for this preview function (keep computeAmounts itself identical to the contract).
2. Errors only appear after clicking "Review distribution". Show per-field errors as soon as a field has been edited and blurred (invalid/duplicate/zero/self/token address, bad percent, amount precision), and show the allocation error in the summary live. Visually disable "Review distribution" (aria-disabled, with a short reason such as "Fix 2 issues to continue") while the split is invalid; clicking it should still reveal all errors and focus the first invalid field.

Then run vitest, typecheck, lint and build; report results.
