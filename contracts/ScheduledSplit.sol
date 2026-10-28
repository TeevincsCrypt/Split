// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ScheduledSplit
/// @notice Escrows USDC for scheduled split payments that anyone can execute once due.
/// @dev Schedules are fully pre-funded on creation and can be cancelled only by their payer.
///
///      USDC blocklist — atomic execution:
///      Each `execute` call pays all recipients in a single loop. If USDC rejects a transfer
///      to any one recipient (e.g., that address is USDC-blocklisted), the entire execution
///      reverts and no recipient receives a payment for that installment. The schedule
///      remains intact; the payer can call `cancel` at any time to recover the full remaining
///      deposit (including due-but-unexecuted payments). Off-chain callers should monitor
///      recipient blocklist status before triggering execution.
///
///      USDC contract-level freeze:
///      USDC is a centralised stablecoin whose issuer can freeze the token at a contract
///      address. If this contract's address is frozen by the issuer, both `execute` and
///      `cancel` will revert. This is an inherent trust assumption of USDC custody.
///
///      Cancel/execute ordering:
///      `execute` is permissionless; any account may call it once a payment is due. When a
///      payer submits a `cancel` and an executor submits `execute` for the same schedule in
///      the same block, whichever transaction is ordered first wins. The payer's refund
///      therefore includes all payments whose `execute` had not yet landed. This is
///      intentional: "the payer can cancel at any time and get back everything not yet paid."
contract ScheduledSplit is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Reverts when constructor receives a zero or codeless USDC address.
    error InvalidUsdcAddress();

    /// @notice Reverts when recipients and bps arrays have different lengths.
    error LengthMismatch();

    /// @notice Reverts when no recipients are provided.
    error NoRecipients();

    /// @notice Reverts when recipient count exceeds MAX_RECIPIENTS.
    /// @param count Number of recipients provided.
    error TooManyRecipients(uint256 count);

    /// @notice Reverts when schedule name length is outside [1, 64] bytes.
    error InvalidName();

    /// @notice Reverts when a recipient is zero, this contract, or the USDC token address.
    /// @param index Index of the invalid recipient.
    error InvalidRecipient(uint256 index);

    /// @notice Reverts when a recipient appears more than once.
    /// @param index Index where duplicate recipient is detected.
    error DuplicateRecipient(uint256 index);

    /// @notice Reverts when a basis-point allocation is zero.
    /// @param index Index of the zero allocation.
    error ZeroAllocation(uint256 index);

    /// @notice Reverts when basis-point allocations do not sum to 10,000.
    /// @param sum Computed basis-point sum.
    error InvalidAllocationTotal(uint256 sum);

    /// @notice Reverts when a computed allocation rounds down to zero.
    /// @param index Index whose computed amount is zero.
    error AllocationRoundsToZero(uint256 index);

    /// @notice Reverts when amountPerPayment is zero.
    error ZeroAmountPerPayment();

    /// @notice Reverts when dueTimes is empty, too long, not strictly increasing, or first due time is not in the future.
    error InvalidDueTimes();

    /// @notice Reverts when cancel caller is not the schedule payer.
    error NotPayer();

    /// @notice Reverts when operating on a schedule that is already cancelled.
    error ScheduleCancelled_();

    /// @notice Reverts when executing a schedule that has no remaining payments.
    error ScheduleComplete();

    /// @notice Reverts when attempting execution before the next due time.
    /// @param dueTime The next due timestamp for the schedule.
    error NotYetDue(uint64 dueTime);

    /// @notice Reverts when a schedule id does not exist.
    /// @param id The missing schedule id.
    error ScheduleNotFound(uint256 id);

    /// @notice Reverts when funded deposit increase does not exactly match expected value.
    error DepositMismatch();

    /// @notice Emitted when a schedule is created and funded.
    /// @param id Schedule identifier.
    /// @param payer Account that created and funded the schedule.
    /// @param nameHash Keccak-256 hash of the schedule name.
    /// @param name Human-readable schedule name.
    /// @param amountPerPayment Amount released per execution.
    /// @param dueTimes Strictly increasing payment due timestamps.
    /// @param recipients Recipient addresses.
    /// @param bps Recipient allocations in basis points.
    event ScheduleCreated(
        uint256 indexed id,
        address indexed payer,
        bytes32 indexed nameHash,
        string name,
        uint96 amountPerPayment,
        uint64[] dueTimes,
        address[] recipients,
        uint16[] bps
    );

    /// @notice Emitted when one scheduled payment is executed.
    /// @param id Schedule identifier.
    /// @param index Payment index that was executed.
    /// @param executor Account that triggered execution.
    /// @param dueTime Due timestamp for the executed payment.
    /// @param amounts Per-recipient transferred amounts.
    event ScheduledPaymentExecuted(
        uint256 indexed id,
        uint32 index,
        address indexed executor,
        uint64 dueTime,
        uint256[] amounts
    );

    /// @notice Emitted when a schedule is cancelled and remaining funds refunded.
    /// @param id Schedule identifier.
    /// @param refund Amount refunded to payer.
    event ScheduleCancelled(uint256 indexed id, uint256 refund);

    /// @notice Maximum number of recipients allowed in one schedule.
    uint16 public constant MAX_RECIPIENTS = 50;

    /// @notice Maximum number of scheduled payments allowed.
    uint16 public constant MAX_PAYMENTS = 24;

    /// @notice Basis-point denominator used for allocations.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice USDC token used by this contract.
    IERC20 public immutable usdc;

    /// @notice Total number of created schedules.
    uint256 public scheduleCount;

    /// @notice Scheduled payout data.
    struct Schedule {
        address payer;
        uint96 amountPerPayment;
        uint64[] dueTimes;
        uint32 executed;
        bool cancelled;
        address[] recipients;
        uint16[] bps;
        string name;
    }

    /// @notice Mapping from schedule id to schedule data.
    mapping(uint256 => Schedule) private _schedules;

    /// @notice Creates the contract with a fixed USDC token.
    /// @param usdc_ USDC token address, must be non-zero and have deployed code.
    constructor(address usdc_) {
        if (usdc_ == address(0) || usdc_.code.length == 0) {
            revert InvalidUsdcAddress();
        }
        usdc = IERC20(usdc_);
    }

    /// @notice Creates and fully funds a new payment schedule.
    /// @param name Human-readable schedule name (1..64 bytes).
    /// @param recipients Recipient addresses.
    /// @param bps Basis-point allocations corresponding to recipients.
    /// @param amountPerPayment Amount released each time `execute` succeeds.
    /// @param dueTimes Strictly increasing future due timestamps.
    /// @return id Newly created schedule identifier.
    function createSchedule(
        string calldata name,
        address[] calldata recipients,
        uint16[] calldata bps,
        uint96 amountPerPayment,
        uint64[] calldata dueTimes
    ) external nonReentrant returns (uint256 id) {
        // Validate all inputs before any state change
        _validateCreateSchedule(name, recipients, bps, amountPerPayment, dueTimes);

        // Store schedule (effects first)
        id = ++scheduleCount;
        _storeSchedule(id, name, recipients, bps, amountPerPayment, dueTimes);

        // Transfer funds and verify exact deposit
        _pullDeposit(msg.sender, uint256(amountPerPayment) * dueTimes.length);

        // Emit (after all state/interaction)
        emit ScheduleCreated(
            id,
            msg.sender,
            keccak256(bytes(name)),
            name,
            amountPerPayment,
            dueTimes,
            recipients,
            bps
        );
    }

    /// @dev Validates all createSchedule inputs; reverts on any violation.
    function _validateCreateSchedule(
        string calldata name,
        address[] calldata recipients,
        uint16[] calldata bps,
        uint96 amountPerPayment,
        uint64[] calldata dueTimes
    ) private view {
        uint256 recipientsLen = recipients.length;
        if (recipientsLen != bps.length) revert LengthMismatch();
        if (recipientsLen == 0) revert NoRecipients();
        if (recipientsLen > MAX_RECIPIENTS) revert TooManyRecipients(recipientsLen);

        uint256 nameLen = bytes(name).length;
        if (nameLen == 0 || nameLen > 64) revert InvalidName();

        if (amountPerPayment == 0) revert ZeroAmountPerPayment();

        uint256 dueLen = dueTimes.length;
        if (dueLen == 0 || dueLen > MAX_PAYMENTS) revert InvalidDueTimes();
        if (dueTimes[0] <= block.timestamp) revert InvalidDueTimes();
        for (uint256 i = 1; i < dueLen; ++i) {
            if (dueTimes[i] <= dueTimes[i - 1]) revert InvalidDueTimes();
        }

        address usdcAddr = address(usdc);
        for (uint256 i = 0; i < recipientsLen; ++i) {
            address r = recipients[i];
            if (r == address(0) || r == address(this) || r == usdcAddr) revert InvalidRecipient(i);
            for (uint256 j = 0; j < i; ++j) {
                if (r == recipients[j]) revert DuplicateRecipient(i);
            }
        }

        // Validate allocation (run _computeAmounts in a pure context via bps copy)
        uint16[] memory bpsMem = new uint16[](recipientsLen);
        for (uint256 i = 0; i < recipientsLen; ++i) {
            bpsMem[i] = bps[i];
        }
        _computeAmounts(uint256(amountPerPayment), bpsMem);
    }

    /// @dev Writes schedule data to storage; called after validation.
    function _storeSchedule(
        uint256 id,
        string calldata name,
        address[] calldata recipients,
        uint16[] calldata bps,
        uint96 amountPerPayment,
        uint64[] calldata dueTimes
    ) private {
        Schedule storage s = _schedules[id];
        s.payer = msg.sender;
        s.amountPerPayment = amountPerPayment;
        s.name = name;
        uint256 dueLen = dueTimes.length;
        for (uint256 i = 0; i < dueLen; ++i) {
            s.dueTimes.push(dueTimes[i]);
        }
        uint256 rLen = recipients.length;
        for (uint256 i = 0; i < rLen; ++i) {
            s.recipients.push(recipients[i]);
            s.bps.push(bps[i]);
        }
    }

    /// @dev Pulls `amount` USDC from `from` and verifies exact receipt.
    function _pullDeposit(address from, uint256 amount) private {
        uint256 before = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(from, address(this), amount);
        if (usdc.balanceOf(address(this)) - before != amount) revert DepositMismatch();
    }

    /// @notice Executes the next due payment for a schedule.
    /// @param id Schedule identifier.
    function execute(uint256 id) external nonReentrant {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }

        Schedule storage s = _schedules[id];
        if (s.cancelled) {
            revert ScheduleCancelled_();
        }

        uint256 dueLen = s.dueTimes.length;
        uint32 idx = s.executed;
        if (idx == dueLen) {
            revert ScheduleComplete();
        }

        uint64 dueTime = s.dueTimes[idx];
        if (block.timestamp < dueTime) {
            revert NotYetDue(dueTime);
        }

        uint256 recipientsLen = s.recipients.length;
        uint16[] memory bpsMemory = new uint16[](recipientsLen);
        for (uint256 i = 0; i < recipientsLen; ++i) {
            bpsMemory[i] = s.bps[i];
        }

        uint256[] memory amounts = _computeAmounts(uint256(s.amountPerPayment), bpsMemory);

        s.executed = idx + 1;

        for (uint256 i = 0; i < recipientsLen; ++i) {
            usdc.safeTransfer(s.recipients[i], amounts[i]);
        }

        emit ScheduledPaymentExecuted(id, idx, msg.sender, dueTime, amounts);
    }

    /// @notice Cancels a schedule and refunds all remaining deposit to its payer.
    /// @param id Schedule identifier.
    function cancel(uint256 id) external nonReentrant {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }

        Schedule storage s = _schedules[id];
        if (msg.sender != s.payer) {
            revert NotPayer();
        }
        if (s.cancelled) {
            revert ScheduleCancelled_();
        }

        uint256 refund = uint256(s.amountPerPayment) * (s.dueTimes.length - s.executed);

        s.cancelled = true;

        usdc.safeTransfer(s.payer, refund);

        emit ScheduleCancelled(id, refund);
    }

    /// @notice Returns a full schedule by id.
    /// @param id Schedule identifier.
    /// @return schedule Full schedule struct.
    function getSchedule(uint256 id) external view returns (Schedule memory schedule) {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }
        schedule = _schedules[id];
    }

    /// @notice Returns the next due time for a schedule.
    /// @param id Schedule identifier.
    /// @return dueTime Next due timestamp, or 0 if schedule is done or cancelled.
    function nextDueTime(uint256 id) external view returns (uint64 dueTime) {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }

        Schedule storage s = _schedules[id];
        if (s.cancelled) {
            return 0;
        }

        uint256 executed = s.executed;
        if (executed >= s.dueTimes.length) {
            return 0;
        }

        return s.dueTimes[executed];
    }

    /// @notice Returns whether the next payment of a schedule is currently executable.
    /// @param id Schedule identifier.
    /// @return due True when schedule is active, incomplete, and current block time is at or past next due time.
    function isDue(uint256 id) external view returns (bool due) {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }

        Schedule storage s = _schedules[id];
        due = !s.cancelled && s.executed < s.dueTimes.length && block.timestamp >= s.dueTimes[s.executed];
    }

    /// @notice Returns currently escrowed amount for a schedule.
    /// @param id Schedule identifier.
    /// @return remaining Remaining deposit amount, or 0 if cancelled.
    function remainingDeposit(uint256 id) external view returns (uint256 remaining) {
        if (id == 0 || id > scheduleCount) {
            revert ScheduleNotFound(id);
        }

        Schedule storage s = _schedules[id];
        if (s.cancelled) {
            return 0;
        }

        remaining = uint256(s.amountPerPayment) * (s.dueTimes.length - s.executed);
    }

    /// @notice Previews split amounts for one payment amount and recipient allocations.
    /// @param amountPerPayment Total amount to split.
    /// @param bps Basis-point allocations.
    /// @return amounts Computed per-recipient amounts.
    function previewAmounts(uint96 amountPerPayment, uint16[] calldata bps)
        external
        pure
        returns (uint256[] memory amounts)
    {
        uint256 len = bps.length;
        uint16[] memory bpsMemory = new uint16[](len);
        for (uint256 i = 0; i < len; ++i) {
            bpsMemory[i] = bps[i];
        }
        return _computeAmounts(uint256(amountPerPayment), bpsMemory);
    }

    /// @notice Computes split amounts from basis-point allocations.
    /// @dev Uses floor division for all recipients except the last, which receives the remainder.
    /// @param totalAmount Total amount to split.
    /// @param bps Basis-point allocations in memory.
    /// @return amounts Computed per-recipient amounts.
    function _computeAmounts(uint256 totalAmount, uint16[] memory bps)
        internal
        pure
        returns (uint256[] memory amounts)
    {
        uint256 len = bps.length;
        if (len == 0) {
            revert NoRecipients();
        }

        amounts = new uint256[](len);

        uint256 sumBps = 0;
        for (uint256 i = 0; i < len; ++i) {
            uint16 share = bps[i];
            if (share == 0) {
                revert ZeroAllocation(i);
            }
            sumBps += share;
        }

        if (sumBps != BPS_DENOMINATOR) {
            revert InvalidAllocationTotal(sumBps);
        }

        uint256 distributed = 0;
        for (uint256 i = 0; i + 1 < len; ++i) {
            uint256 amount = (totalAmount * bps[i]) / BPS_DENOMINATOR;
            if (amount == 0) {
                revert AllocationRoundsToZero(i);
            }
            amounts[i] = amount;
            distributed += amount;
        }

        uint256 lastIndex = len - 1;
        uint256 lastAmount = totalAmount - distributed;
        if (lastAmount == 0) {
            revert AllocationRoundsToZero(lastIndex);
        }
        amounts[lastIndex] = lastAmount;
    }
}
