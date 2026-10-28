// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";

contract ScheduledSplitCancelTest is ScheduledSplitBase {

    // ─── Access control ───────────────────────────────────────────────────────

    function test_Cancel_Revert_NotPayer() public {
        uint256 id = _createSimple();
        vm.prank(alice);
        vm.expectRevert(ScheduledSplit.NotPayer.selector);
        ss.cancel(id);
    }

    function test_Cancel_Revert_ScheduleNotFound_IdZero() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 0));
        ss.cancel(0);
    }

    function test_Cancel_Revert_ScheduleNotFound_IdTooHigh() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 99));
        ss.cancel(99);
    }

    // ─── Happy path: cancel before any execution ──────────────────────────────

    function test_Cancel_BeforeAnyExecute_FullRefund() public {
        // Case (a): Before any execute — refund == amountPerPayment * dueTimes.length
        uint64[] memory d = _due3();
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        uint256 id = ss.createSchedule("Test", r, _bps1(), AMOUNT, d);

        uint256 payerBefore = token.balanceOf(payer);
        vm.prank(payer);
        ss.cancel(id);

        uint256 expectedRefund = uint256(AMOUNT) * 3;
        assertEq(token.balanceOf(payer), payerBefore + expectedRefund);
        assertEq(token.balanceOf(address(ss)), 0);
    }

    // ─── Mid-way cancel ───────────────────────────────────────────────────────

    function test_Cancel_Midway_PartialRefund() public {
        // Case (b): 1 of 3 executed — refund == amountPerPayment * 2
        uint256 id = _createTriple();

        vm.warp(DUE1);
        ss.execute(id); // execute payment 0

        uint256 payerBefore = token.balanceOf(payer);
        vm.prank(payer);
        ss.cancel(id);

        uint256 expectedRefund = uint256(AMOUNT) * 2;
        assertEq(token.balanceOf(payer), payerBefore + expectedRefund);
    }

    // ─── Cancel with due-but-unexecuted payments ──────────────────────────────

    function test_Cancel_DueButUnexecuted() public {
        // Case (c): warp past 2 due times without executing; cancel
        // Remaining = amountPerPayment * (3 total - 0 executed) = amountPerPayment * 3
        // because cancel does not auto-execute — it refunds all remaining including past-due
        uint256 id = _createTriple();

        // Warp past 2 due times without executing
        vm.warp(DUE2 + 1);

        uint256 payerBefore = token.balanceOf(payer);
        vm.prank(payer);
        ss.cancel(id);

        // Still 0 executed, so refund = AMOUNT * 3
        uint256 expectedRefund = uint256(AMOUNT) * 3;
        assertEq(token.balanceOf(payer), payerBefore + expectedRefund);
    }

    function test_Cancel_DueButUnexecuted_AfterOneExec() public {
        // Create 3-payment; execute 1; warp past next 2 without executing; cancel
        // Refund = AMOUNT * (3 - 1) = AMOUNT * 2
        uint256 id = _createTriple();

        vm.warp(DUE1);
        ss.execute(id);

        // Warp past remaining 2 due times without executing
        vm.warp(DUE3 + 1);

        uint256 payerBefore = token.balanceOf(payer);
        vm.prank(payer);
        ss.cancel(id);

        uint256 expectedRefund = uint256(AMOUNT) * 2;
        assertEq(token.balanceOf(payer), payerBefore + expectedRefund);
    }

    // ─── Cancel event emission ────────────────────────────────────────────────

    function test_Cancel_EmitsScheduleCancelled() public {
        uint64[] memory d = _due3();
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        uint256 id = ss.createSchedule("Test", r, _bps1(), AMOUNT, d);

        uint256 expectedRefund = uint256(AMOUNT) * 3;
        vm.prank(payer);
        vm.expectEmit(true, false, false, true, address(ss));
        emit ScheduledSplit.ScheduleCancelled(id, expectedRefund);
        ss.cancel(id);
    }

    // ─── Cancel marks cancelled ───────────────────────────────────────────────

    function test_Cancel_MarksScheduleAsCancelled() public {
        uint256 id = _createSimple();
        vm.prank(payer);
        ss.cancel(id);

        ScheduledSplit.Schedule memory s = ss.getSchedule(id);
        assertTrue(s.cancelled);
    }

    // ─── Double cancel ────────────────────────────────────────────────────────

    function test_Cancel_Revert_AlreadyCancelled() public {
        uint256 id = _createSimple();
        vm.startPrank(payer);
        ss.cancel(id);
        vm.expectRevert(ScheduledSplit.ScheduleCancelled_.selector);
        ss.cancel(id);
        vm.stopPrank();
    }

    // ─── remainingDeposit after cancel ───────────────────────────────────────

    function test_RemainingDeposit_ZeroAfterCancel() public {
        uint256 id = _createSimple();
        assertEq(ss.remainingDeposit(id), uint256(AMOUNT) * 1);
        vm.prank(payer);
        ss.cancel(id);
        assertEq(ss.remainingDeposit(id), 0);
    }

    function test_RemainingDeposit_DecreasesAfterExecute() public {
        uint256 id = _createTriple();
        assertEq(ss.remainingDeposit(id), uint256(AMOUNT) * 3);
        vm.warp(DUE1);
        ss.execute(id);
        assertEq(ss.remainingDeposit(id), uint256(AMOUNT) * 2);
    }

    // ─── nextDueTime after cancel ────────────────────────────────────────────

    function test_NextDueTime_ZeroAfterCancel() public {
        uint256 id = _createSimple();
        vm.prank(payer);
        ss.cancel(id);
        assertEq(ss.nextDueTime(id), 0);
    }

    // ─── isDue after cancel ───────────────────────────────────────────────────

    function test_IsDue_FalseAfterCancel() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);
        vm.prank(payer);
        ss.cancel(id);
        assertFalse(ss.isDue(id));
    }
}
