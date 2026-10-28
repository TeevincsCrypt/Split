// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

// ─── Handler for invariant testing ───────────────────────────────────────────

/// @dev Stateful handler that drives arbitrary schedule lifecycle operations.
///      Deploys its own ScheduledSplit + MockERC20 so the invariant test can
///      reference them via the public getters below.
contract ScheduledSplitHandler is Test {

    ScheduledSplit  public handlerSS;
    MockERC20       public handlerToken;

    uint256[] public createdIds;

    // ─── helpers duplicated from base (no inheritance to keep types public) ───

    function _makeRecipients(uint256 n) internal pure returns (address[] memory r) {
        r = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            r[i] = address(uint160(0xBEEF0000 + i));
        }
    }

    function _equalBps(uint256 n) internal pure returns (uint16[] memory b) {
        b = new uint16[](n);
        uint16 share = uint16(10_000 / n);
        uint16 remainder = uint16(10_000 - share * uint16(n));
        for (uint256 i = 0; i < n - 1; ++i) {
            b[i] = share;
        }
        b[n - 1] = share + remainder;
    }

    constructor() {
        handlerToken = new MockERC20("Mock USDC", "mUSDC", 6);
        handlerSS    = new ScheduledSplit(address(handlerToken));
        vm.warp(1_000_000);
    }

    /// @dev Create a schedule with n recipients and uniform bps.
    function createFuzzed(uint96 amount, uint8 nRecipients) external {
        uint256 n = bound(nRecipients, 1, 50);
        amount = uint96(bound(amount, 10_000, 1e12));

        address[] memory r = _makeRecipients(n);
        uint16[] memory b = _equalBps(n);
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(block.timestamp + 1 days);

        handlerToken.mint(address(this), uint256(amount));
        handlerToken.approve(address(handlerSS), type(uint256).max);

        try handlerSS.createSchedule("Fuzz", r, b, amount, d) returns (uint256 id) {
            createdIds.push(id);
        } catch {}
    }

    /// @dev Execute the next payment for a random created schedule.
    function executeFuzzed(uint256 idSeed) external {
        uint256 len = createdIds.length;
        if (len == 0) return;
        uint256 idx = bound(idSeed, 0, len - 1);
        uint256 id = createdIds[idx];
        vm.warp(block.timestamp + 1 days + 1);
        try handlerSS.execute(id) {} catch {}
    }

    /// @dev Cancel a random created schedule.
    function cancelFuzzed(uint256 idSeed) external {
        uint256 len = createdIds.length;
        if (len == 0) return;
        uint256 idx = bound(idSeed, 0, len - 1);
        uint256 id = createdIds[idx];

        try handlerSS.getSchedule(id) returns (ScheduledSplit.Schedule memory s) {
            if (s.payer != address(this) || s.cancelled) return;
        } catch {
            return;
        }

        try handlerSS.cancel(id) {} catch {}
    }
}

// ─── Fuzz unit tests ──────────────────────────────────────────────────────────

contract ScheduledSplitFuzzTest is ScheduledSplitBase {

    /// @dev Fuzz amountPerPayment and n recipients with even bps split.
    /// Verifies: sum of computed amounts == amountPerPayment.
    function testFuzz_AmountsSumToTotal(uint96 amount, uint8 nRecipients) public {
        uint256 n = bound(nRecipients, 1, 50);
        // With equal bps split, each non-last recipient gets floor(10_000/n) bps.
        // To avoid AllocationRoundsToZero: amount * (10_000/n) / 10_000 >= 1
        // => amount >= n (since each share >= 200 bps for n<=50, amount>=50 is sufficient)
        // Use 10_000 as safe lower bound: ensures every 1-bps share is non-zero.
        amount = uint96(bound(amount, 10_000, 1e12));

        uint16[] memory b = _equalBps(n);
        uint256[] memory amounts = ss.previewAmounts(amount, b);

        uint256 total = 0;
        for (uint256 i = 0; i < n; ++i) {
            total += amounts[i];
        }
        assertEq(total, amount, "amounts do not sum to amountPerPayment");
    }

    /// @dev Fuzz with bps [3333, 3333, 3334] — last recipient absorbs rounding.
    function testFuzz_RoundingBps3_SumsToAmount(uint96 amount) public {
        // Need floor(amount * 3333 / 10_000) >= 1
        amount = uint96(bound(amount, 4, 1e12));

        uint16[] memory b = _bps3();
        uint256[] memory amounts = ss.previewAmounts(amount, b);

        uint256 a0 = (uint256(amount) * 3333) / 10_000;
        uint256 a1 = (uint256(amount) * 3333) / 10_000;
        uint256 a2 = uint256(amount) - a0 - a1;

        assertEq(amounts[0], a0, "recipient 0 amount mismatch");
        assertEq(amounts[1], a1, "recipient 1 amount mismatch");
        assertEq(amounts[2], a2, "recipient 2 amount mismatch");
        assertEq(amounts[0] + amounts[1] + amounts[2], amount, "sum mismatch");
    }

    /// @dev Full end-to-end fuzz: create schedule, execute, verify token transfers.
    function testFuzz_CreateAndExecute(uint96 amount, uint8 nRecipients) public {
        uint256 n = bound(nRecipients, 1, 50);
        // Use 10_000 as lower bound — safe for all n<=50 equal splits.
        amount = uint96(bound(amount, 10_000, 1e12));

        address[] memory r = _makeRecipients(n);
        uint16[] memory b = _equalBps(n);
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0 + 1 days);

        uint256 totalDeposit = uint256(amount) * 1;
        _fund(payer, totalDeposit);

        uint256 payerBefore = token.balanceOf(payer);

        vm.prank(payer);
        uint256 id = ss.createSchedule("F", r, b, amount, d);

        assertEq(token.balanceOf(payer), payerBefore - totalDeposit);

        vm.warp(T0 + 1 days);
        ss.execute(id);

        uint256[] memory amounts = ss.previewAmounts(amount, b);
        uint256 sum = 0;
        for (uint256 i = 0; i < n; ++i) {
            assertEq(token.balanceOf(r[i]), amounts[i]);
            sum += amounts[i];
        }
        assertEq(sum, amount);
    }
}

// ─── Invariant test ───────────────────────────────────────────────────────────

contract ScheduledSplitInvariantTest is Test {

    ScheduledSplitHandler internal handler;

    function setUp() public {
        handler = new ScheduledSplitHandler();
        targetContract(address(handler));
    }

    /// @dev Invariant: contract token balance == sum of remainingDeposit(id) for all ids.
    function invariant_BalanceEqualsRemainingDeposits() public view {
        ScheduledSplit handlerSS    = handler.handlerSS();
        MockERC20      handlerToken = handler.handlerToken();

        uint256 count = handlerSS.scheduleCount();
        uint256 sumRemaining = 0;
        for (uint256 id = 1; id <= count; ++id) {
            sumRemaining += handlerSS.remainingDeposit(id);
        }

        assertEq(
            handlerToken.balanceOf(address(handlerSS)),
            sumRemaining,
            "balance != sum(remainingDeposit)"
        );
    }
}
