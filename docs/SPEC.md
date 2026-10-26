# Split — product & contract specification

> Tagline: **One payment. Every contributor. Done.**
> Split lets teams, project owners, DAOs, freelancers and businesses distribute
> USDC to multiple recipients through one transparent, onchain payment flow.

This document is the specification handed to Arc Studio (`arc-studio run --file docs/SPEC.md`).
All contract and app code is generated in Arc Studio and pulled into this repo.

## 1. Contract: `SplitDistributor`

Non-custodial, single atomic transaction. The contract never holds funds between
transactions: it pulls USDC from the payer and pays each recipient within the same call,
using `SafeERC20.safeTransferFrom(payer, recipient, amount)` (no pooled custody).

### Configuration
- `IERC20 public immutable usdc` — set once in the constructor to the verified official
  USDC ERC-20 address of the target network. Constructor reverts on `address(0)` or an
  address with no code. Users can never pass a token address.
- No owner, no admin, no pause, no withdraw, no upgradeability, no fees.

### Units
- Amounts are in USDC smallest units (USDC ERC-20 interface uses **6 decimals**).
- Allocations are in **basis points** (`uint16`), `10_000` = 100% (0.01% precision).
- `MAX_RECIPIENTS` constant — pick a value measured by a gas test (target: a full-size
  distribution stays well under typical block gas limits; e.g. 50) and document it.
- Split name: `string`, 1–64 bytes, emitted in the event only (not stored).

### `distribute(string name, uint256 totalAmount, address[] recipients, uint16[] bps) returns (uint256 distributionId)`
Checks (custom errors, all before any transfer):
1. `recipients.length == bps.length` else `LengthMismatch`.
2. `1 <= length <= MAX_RECIPIENTS` else `NoRecipients` / `TooManyRecipients`.
3. `totalAmount > 0` else `ZeroAmount`.
4. name length 1..64 else `InvalidName`.
5. Each recipient: not `address(0)`, not the contract itself, not the USDC token, no
   duplicates (O(n²) check is fine at this size) — `InvalidRecipient(index)` /
   `DuplicateRecipient(index)`.
6. Each `bps[i] > 0` else `ZeroAllocation(index)`; `sum(bps) == 10_000` else `InvalidAllocationTotal(sum)`.
7. Each computed amount must be `> 0` else `AllocationRoundsToZero(index)` (prevents a
   recipient silently receiving nothing).

Rounding policy (deterministic): for `i < n-1`, `amount[i] = totalAmount * bps[i] / 10_000`
(floor). The **last recipient** receives `totalAmount - sum(previous)`, so amounts always sum
exactly to `totalAmount`.

Effects: `distributionId = ++distributionCount;` (only state written).

Interactions: for each recipient `usdc.safeTransferFrom(msg.sender, recipient, amount[i])`.
Any failed transfer reverts the whole call — no recipient is skipped, no partial success.
Function is `nonReentrant` (OpenZeppelin `ReentrancyGuard`).

Event (emitted after transfers, so only exists for successful distributions):
```
event Distributed(
  uint256 indexed distributionId,
  address indexed payer,
  bytes32 indexed nameHash,   // keccak256(bytes(name)) for filtering
  string name,
  uint256 totalAmount,
  address[] recipients,
  uint16[] bps,
  uint256[] amounts
);
```

### Views
- `previewAmounts(uint256 totalAmount, uint16[] bps) returns (uint256[] amounts)` — same
  math as `distribute` (shared internal function), runs the allocation checks, used by the UI.
- `distributionCount()`, `MAX_RECIPIENTS`, `BPS_DENOMINATOR`, `usdc`.

### Tests (Foundry, mock USDC lives only in `test/`)
Single recipient; multi-recipient 40/25/20/15 of 100 USDC; exact allocations; non-even
division (e.g. 100 units over 3 × 3333/3333/3334 bps) with remainder to last; fuzz test:
amounts always sum to total and payer balance drops by exactly total; zero address; self /
token address as recipient; duplicates; bps sum 9999 and 10001; zero bps; zero amount;
length mismatch; empty arrays; > MAX_RECIPIENTS; allocation rounding to zero; insufficient
allowance; insufficient balance; token returning `false`; token that reverts; reentrant
token attempting to re-enter `distribute` (must revert); repeated calls increment id;
event contents; contract holds zero balance after every call; constructor rejects zero /
codeless token; gas measurement at MAX_RECIPIENTS.

## 2. App

Vite + React + TypeScript + Tailwind (Arc Studio sandbox stack), wagmi + viem, injected
EVM wallets (MetaMask, Rabby). Dark-first, minimal, premium fintech look; one accent color.

Pages: Landing (hero "Pay everyone. In one move."), Dashboard, Create split (editor → review →
approve → distribute → receipt), Activity (onchain `Distributed` events), Distribution
details/receipt (`/d/:id`, built from the event + receipt + block timestamp), How it works.

Rules: integer math (`parseUnits`, bigint, bps) as source of truth; exact-amount approval
(never unlimited by default); wait for receipts; success only after confirmation; explorer
links; no sample data shown as real; network config from env vars, no silent chain fallback.
