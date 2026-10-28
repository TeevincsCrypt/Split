// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";

contract ScheduledSplitCreateTest is ScheduledSplitBase {

    // ─── Happy paths ──────────────────────────────────────────────────────────

    function test_Create_OneOff_SinglePayment() public {
        uint256 before = token.balanceOf(payer);
        uint256 id = _createSimple();

        assertEq(id, 1);
        assertEq(ss.scheduleCount(), 1);

        ScheduledSplit.Schedule memory s = ss.getSchedule(id);
        assertEq(s.payer, payer);
        assertEq(s.amountPerPayment, AMOUNT);
        assertEq(s.dueTimes.length, 1);
        assertEq(s.dueTimes[0], DUE1);
        assertEq(s.recipients.length, 1);
        assertEq(s.recipients[0], alice);
        assertEq(s.bps[0], 10_000);
        assertEq(s.executed, 0);
        assertFalse(s.cancelled);

        // Deposit pulled exactly once
        assertEq(token.balanceOf(payer), before - uint256(AMOUNT) * 1);
        assertEq(token.balanceOf(address(ss)), uint256(AMOUNT) * 1);
    }

    function test_Create_Monthly12() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = _due12();

        uint256 before = token.balanceOf(payer);
        vm.prank(payer);
        uint256 id = ss.createSchedule("Monthly", r, _bps1(), AMOUNT, d);

        assertEq(id, 1);
        ScheduledSplit.Schedule memory s = ss.getSchedule(id);
        assertEq(s.dueTimes.length, 12);
        assertEq(s.amountPerPayment, AMOUNT);

        // Pulled amountPerPayment × 12
        assertEq(token.balanceOf(payer), before - uint256(AMOUNT) * 12);
        assertEq(token.balanceOf(address(ss)), uint256(AMOUNT) * 12);
    }

    function test_Create_IncreasesScheduleCount() public {
        _createSimple();
        _createSimple();
        assertEq(ss.scheduleCount(), 2);
    }

    function test_Create_EmitsScheduleCreated() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = _due1();

        vm.prank(payer);
        vm.expectEmit(true, true, true, true, address(ss));
        emit ScheduledSplit.ScheduleCreated(
            1,
            payer,
            keccak256(bytes("Simple")),
            "Simple",
            AMOUNT,
            d,
            r,
            _bps1()
        );
        ss.createSchedule("Simple", r, _bps1(), AMOUNT, d);
    }

    function test_Create_DepositPulledExactly() public {
        uint256 payerBefore = token.balanceOf(payer);
        uint64[] memory d = _due3();
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        ss.createSchedule("Dep", r, _bps1(), AMOUNT, d);

        uint256 expected = uint256(AMOUNT) * 3;
        assertEq(token.balanceOf(payer), payerBefore - expected);
        assertEq(token.balanceOf(address(ss)), expected);
    }

    // ─── Revert: name ─────────────────────────────────────────────────────────

    function test_Revert_EmptyName() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidName.selector);
        ss.createSchedule("", r, _bps1(), AMOUNT, _due1());
    }

    function test_Revert_NameTooLong() public {
        // 65-byte name
        string memory longName = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 67 chars > 64
        // ensure it's > 64 bytes
        require(bytes(longName).length > 64, "test setup error");
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidName.selector);
        ss.createSchedule(longName, r, _bps1(), AMOUNT, _due1());
    }

    // ─── Revert: recipients / bps ─────────────────────────────────────────────

    function test_Revert_LengthMismatch() public {
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint16[] memory b = _bps1(); // length 1 vs 2 recipients
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.LengthMismatch.selector);
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_NoRecipients() public {
        address[] memory r = new address[](0);
        uint16[] memory b = new uint16[](0);
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.NoRecipients.selector);
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_TooManyRecipients() public {
        uint256 n = 51;
        address[] memory r = _makeRecipients(n);
        uint16[] memory b = _equalBps(n);
        _fund(payer, uint256(AMOUNT) * 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.TooManyRecipients.selector, n));
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_ZeroAmountPerPayment() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.ZeroAmountPerPayment.selector);
        ss.createSchedule("X", r, _bps1(), 0, _due1());
    }

    function test_Revert_ZeroAddressRecipient() public {
        address[] memory r = new address[](1);
        r[0] = address(0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.InvalidRecipient.selector, 0));
        ss.createSchedule("X", r, _bps1(), AMOUNT, _due1());
    }

    function test_Revert_SelfRecipient() public {
        address[] memory r = new address[](1);
        r[0] = address(ss);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.InvalidRecipient.selector, 0));
        ss.createSchedule("X", r, _bps1(), AMOUNT, _due1());
    }

    function test_Revert_UsdcRecipient() public {
        address[] memory r = new address[](1);
        r[0] = address(token);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.InvalidRecipient.selector, 0));
        ss.createSchedule("X", r, _bps1(), AMOUNT, _due1());
    }

    function test_Revert_DuplicateRecipient() public {
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = alice; // duplicate
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.DuplicateRecipient.selector, 1));
        ss.createSchedule("X", r, _bps2(), AMOUNT, _due1());
    }

    function test_Revert_ZeroBpsAllocation() public {
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 0;
        b[1] = 10_000;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ZeroAllocation.selector, 0));
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_BpsSumTooLow() public {
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000;
        b[1] = 4999; // sum = 9999
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.InvalidAllocationTotal.selector, 9999));
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_BpsSumTooHigh() public {
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000;
        b[1] = 5001; // sum = 10001
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.InvalidAllocationTotal.selector, 10001));
        ss.createSchedule("X", r, b, AMOUNT, _due1());
    }

    function test_Revert_RoundingToZero() public {
        // 1 USDC (1e6) split with 1 bps (0.01%) = 100 units → OK
        // Use 2 recipients; first gets 1 bps → floor(1e6 * 1 / 10000) = 100 > 0; OK
        // To get zero: use amount=1, bps first recipient = 1 (floor(1*1/10000)=0)
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 1;
        b[1] = 9999;
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.AllocationRoundsToZero.selector, 0));
        ss.createSchedule("X", r, b, 1, _due1()); // amount=1, so 1*1/10000=0
    }

    // ─── Revert: dueTimes ─────────────────────────────────────────────────────

    function test_Revert_EmptyDueTimes() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](0);
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidDueTimes.selector);
        ss.createSchedule("X", r, _bps1(), AMOUNT, d);
    }

    function test_Revert_TooManyDueTimes() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](25);
        for (uint256 i = 0; i < 25; ++i) {
            d[i] = uint64(T0 + (i + 1) * 1 days);
        }
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidDueTimes.selector);
        ss.createSchedule("X", r, _bps1(), AMOUNT, d);
    }

    function test_Revert_DueTimesNotStrictlyIncreasing() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](3);
        d[0] = uint64(T0 + 1 days);
        d[1] = uint64(T0 + 2 days);
        d[2] = uint64(T0 + 2 days); // equal, not strictly increasing
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidDueTimes.selector);
        ss.createSchedule("X", r, _bps1(), AMOUNT, d);
    }

    function test_Revert_FirstDueTimeEqualsNow() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0); // == block.timestamp
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidDueTimes.selector);
        ss.createSchedule("X", r, _bps1(), AMOUNT, d);
    }

    function test_Revert_FirstDueTimeInPast() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0 - 1); // in the past
        vm.prank(payer);
        vm.expectRevert(ScheduledSplit.InvalidDueTimes.selector);
        ss.createSchedule("X", r, _bps1(), AMOUNT, d);
    }

    // ─── Revert: ScheduleNotFound on id=0 ────────────────────────────────────

    function test_Revert_GetSchedule_IdZero() public {
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 0));
        ss.getSchedule(0);
    }

    function test_Revert_GetSchedule_IdTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(ScheduledSplit.ScheduleNotFound.selector, 99));
        ss.getSchedule(99);
    }
}
