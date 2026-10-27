# Split: scheduled payments specification

Owner's decisions (2026-10-27):
- **Funds are locked in the contract.** The payer deposits the full amount when scheduling, so payday funds are guaranteed.
  The payer can cancel at any time and get back everything not yet paid. There is no admin.
- **Schedules are one-off or repeating** (weekly / every 2 weeks / monthly), up to 24 payments.
- **Triggering:** an automatic keeper bot runs about every 5 minutes, plus a manual "Release" button anyone can press.

## Contract: `ScheduledSplit` (separate from `SplitDistributor`, which stays unchanged)

### Configuration
- `IERC20 public immutable usdc`. The constructor rejects zero or codeless addresses (same rule as SplitDistributor).
- No owner, admin, pause, upgrade, fee or sweep function. `ReentrancyGuard` and `SafeERC20` throughout.
- Constants: `MAX_RECIPIENTS = 50`, `MAX_PAYMENTS = 24`, `BPS_DENOMINATOR = 10_000`.

### Data
```
struct Schedule {
  address payer;
  uint96  amountPerPayment;   // USDC units (6 decimals)
  uint64[] dueTimes;          // strictly increasing unix seconds, length 1..24
  uint32  executed;           // payments already paid (index of next due)
  bool    cancelled;
  address[] recipients;
  uint16[]  bps;
  string  name;               // 1..64 bytes
}
mapping(uint256 => Schedule) schedules;  uint256 public scheduleCount;
```
The frontend computes calendar-accurate due times, e.g. "the 25th of every month at 09:00 in the
payer's timezone" converted to UTC seconds, and passes them as `dueTimes`.

### `createSchedule(name, recipients, bps, amountPerPayment, dueTimes) returns (uint256 id)`
- Same recipient and bps validation as `SplitDistributor`: length match, 1..50, no zero/self/token address,
  no duplicates, each bps > 0, sum == 10 000, no share rounding to zero, name 1..64 bytes.
- `amountPerPayment > 0`; `1 <= dueTimes.length <= 24`; `dueTimes` strictly increasing; `dueTimes[0] > block.timestamp`.
- Pulls `amountPerPayment * dueTimes.length` from the payer with `safeTransferFrom`. Checks that the contract's
  balance rose by exactly that amount, which rejects fee-on-transfer tokens defensively.
- Emits `ScheduleCreated(id, payer, nameHash, name, amountPerPayment, dueTimes, recipients, bps)`.

### `execute(uint256 id)` (permissionless)
- Reverts if the schedule is cancelled, already complete, or `block.timestamp < dueTimes[executed]`.
- Pays exactly one payment (the next due one) with the same rounding as `SplitDistributor`: floor for all
  recipients but the last, who gets the remainder. Increments `executed` **before** transferring.
- Emits `ScheduledPaymentExecuted(id, index, executor, dueTime, amounts)`.
- If several payments are overdue, each `execute` call pays one; the keeper calls it repeatedly.

### `cancel(uint256 id)` (payer only)
- Marks the schedule cancelled and refunds `amountPerPayment * (dueTimes.length - executed)` to the payer.
  This includes payments that are due but not yet executed; that's the payer's choice and is documented in the UI.
- Emits `ScheduleCancelled(id, refund)`.

### Views
`getSchedule(id)`, `nextDueTime(id)` (0 when done or cancelled), `isDue(id)`, `remainingDeposit(id)`,
`previewAmounts(amountPerPayment, bps)`.

### Invariant
The contract's USDC balance equals the sum of `remainingDeposit` across all schedules, at all times.

### Tests (Foundry; mocks only in `test/`)
Create (one-off and 12× monthly), every validation revert, deposit pulled exactly, execute before due reverts,
execute at or after due pays exact amounts, rounding, multiple overdue payments executed in sequence, completion,
execute after completion or cancel reverts, cancel by non-payer reverts, cancel refund maths (before any, mid-way,
with due-but-unexecuted payments), reentrancy via a malicious token, fuzzing of amounts and bps, an invariant test
of balance == sum of remaining deposits, and gas at 50 recipients × 24 payments.

## Keeper bot
- `scripts/keeper.ts` (Bun + viem): reads `ScheduleCreated` events and `nextDueTime`. For each schedule with
  `isDue`, it simulates and then calls `execute` (repeating while still due). It logs tx hashes, never logs secrets,
  and exits 0 when nothing is due.
- `.github/workflows/keeper.yml`: `schedule: cron "*/5 * * * *"` plus `workflow_dispatch`. Needs the GitHub secret
  `KEEPER_PRIVATE_KEY`, a dedicated wallet holding only a little USDC for gas, and the variables `SPLIT_NETWORK`,
  `SCHEDULED_SPLIT_ADDRESS`, `SCHEDULED_SPLIT_DEPLOY_BLOCK` and optionally `RPC_URL`.
- The keeper can only trigger payments that are already due, to the recipients already fixed. It can't move funds anywhere else.
- Caveat: GitHub's scheduled jobs are best-effort and can run several minutes late. Payment happens *at or shortly after*
  the chosen time, never before.

## Saved recipients (app only, no contract)
- An address book kept in the browser (localStorage, versioned schema, wrapped in try/catch): contacts (label + address)
  and saved teams (a named recipient list with percentages). It can save the current split as a team, load a team into
  the editor, add contacts from the book, edit or delete them, and export/import JSON.
- The UI says clearly: "Saved on this device only; not stored onchain." Data is validated on import.
