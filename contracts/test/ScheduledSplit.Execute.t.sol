// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";

contract ScheduledSplitExecuteTest is ScheduledSplitBase {

    // ─── Revert: timing guards ────────────────────────────────────────────────

    function test_Execute_Revert_BeforeDue() public {
        uint256 id = _createSimple();
        // still at T0, due at DUE1 = T0+1 day
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.NotYetDue.selector, DUE1));
        ss.execute(id);
    }

    function test_Execute_Revert_ScheduleNotFound_IdZero() public {
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 0));
        ss.execute(0);
    }

    function test_Execute_Revert_ScheduleNotFound_IdTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 99));
        ss.execute(99);
    }

    // ─── Happy path: exact due time ───────────────────────────────────────────

    function test_Execute_AtExactDueTime() public {
        uint256 id = _createSimple();
        vm.warp(DUE1); // exactly at due time

        uint256 aliceBefore = token.balanceOf(alice);
        ss.execute(id);
        assertEq(token.balanceOf(alice), aliceBefore + AMOUNT);
    }

    // ─── Happy path: after due time ───────────────────────────────────────────

    function test_Execute_AfterDueTime() public {
        uint256 id = _createSimple();
        vm.warp(DUE1 + 1 hours);

        uint256 aliceBefore = token.balanceOf(alice);
        ss.execute(id);
        assertEq(token.balanceOf(alice), aliceBefore + AMOUNT);
    }

    // ─── Exact amounts per recipient (rounding verification) ──────────────────

    function test_Execute_RoundingBps3() public {
        // bps [3333, 3333, 3334] with AMOUNT=1_000e6
        // floor(1_000e6 * 3333 / 10_000) = 333_300_000
        // floor(1_000e6 * 3333 / 10_000) = 333_300_000
        // remainder: 1_000e6 - 333_300_000 - 333_300_000 = 333_400_000
        uint256 id = _createTriple();
        vm.warp(DUE1);

        uint256 aBefore = token.balanceOf(alice);
        uint256 bBefore = token.balanceOf(bob);
        uint256 cBefore = token.balanceOf(charlie);

        ss.execute(id);

        uint256 expected0 = (uint256(AMOUNT) * 3333) / 10_000; // floor
        uint256 expected1 = (uint256(AMOUNT) * 3333) / 10_000; // floor
        uint256 expected2 = uint256(AMOUNT) - expected0 - expected1;  // remainder

        assertEq(token.balanceOf(alice)   - aBefore, expected0);
        assertEq(token.balanceOf(bob)     - bBefore, expected1);
        assertEq(token.balanceOf(charlie) - cBefore, expected2);

        // Sum must equal amountPerPayment exactly
        assertEq(expected0 + expected1 + expected2, AMOUNT);
    }

    // ─── Event emission ───────────────────────────────────────────────────────

    function test_Execute_EmitsScheduledPaymentExecuted() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = AMOUNT;

        vm.expectEmit(true, false, true, true, address(ss));
        emit ScheduledSplit.ScheduledPaymentExecuted(id, 0, address(this), DUE1, amounts);
        ss.execute(id);
    }

    // ─── Sequential overdue payments ─────────────────────────────────────────

    function test_Execute_MultipleOverdue_Sequential() public {
        // Create 3-payment schedule, warp past all 3, then execute 3×
        uint256 id = _createTriple();
        vm.warp(DUE3 + 1); // past all 3 due times

        uint256 aBefore = token.balanceOf(alice);

        // First execute → payment index 0 (due at DUE1)
        ss.execute(id);
        // Second execute → payment index 1 (due at DUE2)
        ss.execute(id);
        // Third execute → payment index 2 (due at DUE3)
        ss.execute(id);

        // Alice should have received 3 × her share
        uint256 aliceShare = (uint256(AMOUNT) * 3333) / 10_000;
        assertEq(token.balanceOf(alice), aBefore + aliceShare * 3);
    }

    function test_Execute_Sequential_VerifyAmountsEachTime() public {
        uint256 id = _createTriple();

        uint256 expectedAlice   = (uint256(AMOUNT) * 3333) / 10_000;
        uint256 expectedBob     = (uint256(AMOUNT) * 3333) / 10_000;
        uint256 expectedCharlie = uint256(AMOUNT) - expectedAlice - expectedBob;

        // Payment 1
        vm.warp(DUE1);
        uint256 a0 = token.balanceOf(alice);
        ss.execute(id);
        assertEq(token.balanceOf(alice)   - a0, expectedAlice);
        assertEq(token.balanceOf(bob)     - 0,  0 + expectedBob);   // bob started at 0
        assertEq(token.balanceOf(charlie) - 0,  0 + expectedCharlie);

        // Payment 2
        vm.warp(DUE2);
        uint256 a1 = token.balanceOf(alice);
        ss.execute(id);
        assertEq(token.balanceOf(alice) - a1, expectedAlice);

        // Payment 3
        vm.warp(DUE3);
        uint256 a2 = token.balanceOf(alice);
        ss.execute(id);
        assertEq(token.balanceOf(alice) - a2, expectedAlice);
    }

    // ─── Completion ───────────────────────────────────────────────────────────

    function test_Execute_Revert_AfterCompletion() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);
        ss.execute(id);

        vm.expectRevert(ScheduledSplit.ScheduleComplete.selector);
        ss.execute(id);
    }

    function test_Execute_ScheduleCompletedAfterAllPayments() public {
        uint256 id = _createTriple();

        vm.warp(DUE1); ss.execute(id);
        vm.warp(DUE2); ss.execute(id);
        vm.warp(DUE3); ss.execute(id);

        // Contract holds no more funds for this schedule
        assertEq(ss.remainingDeposit(id), 0);

        vm.expectRevert(ScheduledSplit.ScheduleComplete.selector);
        ss.execute(id);
    }

    // ─── Execute after cancel ─────────────────────────────────────────────────

    function test_Execute_Revert_AfterCancel() public {
        uint256 id = _createSimple();
        vm.prank(payer);
        ss.cancel(id);

        vm.warp(DUE1);
        vm.expectRevert(ScheduledSplit.ScheduleCancelled_.selector);
        ss.execute(id);
    }

    // ─── Executor is anyone ───────────────────────────────────────────────────

    function test_Execute_AnyoneCanExecute() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);

        vm.prank(executor);
        ss.execute(id);

        assertEq(token.balanceOf(alice), AMOUNT);
    }

    // ─── Executed index increments correctly ─────────────────────────────────

    function test_Execute_IncreasesExecutedIndex() public {
        uint256 id = _createTriple();

        ScheduledSplit.Schedule memory s0 = ss.getSchedule(id);
        assertEq(s0.executed, 0);

        vm.warp(DUE1);
        ss.execute(id);
        ScheduledSplit.Schedule memory s1 = ss.getSchedule(id);
        assertEq(s1.executed, 1);

        vm.warp(DUE2);
        ss.execute(id);
        ScheduledSplit.Schedule memory s2 = ss.getSchedule(id);
        assertEq(s2.executed, 2);
    }

    // ─── isDue helper ────────────────────────────────────────────────────────

    function test_IsDue_FalseBeforeDue() public {
        uint256 id = _createSimple();
        assertFalse(ss.isDue(id));
    }

    function test_IsDue_TrueAtDue() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);
        assertTrue(ss.isDue(id));
    }

    function test_IsDue_FalseAfterCompletion() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);
        ss.execute(id);
        assertFalse(ss.isDue(id));
    }

    // ─── nextDueTime helper ───────────────────────────────────────────────────

    function test_NextDueTime_ReturnsFirstDue() public {
        uint256 id = _createSimple();
        assertEq(ss.nextDueTime(id), DUE1);
    }

    function test_NextDueTime_ZeroAfterComplete() public {
        uint256 id = _createSimple();
        vm.warp(DUE1);
        ss.execute(id);
        assertEq(ss.nextDueTime(id), 0);
    }
}
