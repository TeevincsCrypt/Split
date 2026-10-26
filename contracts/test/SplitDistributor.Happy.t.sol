// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SplitDistributorTestBase} from "./SplitDistributor.Base.t.sol";
import {SplitDistributor} from "../SplitDistributor.sol";

/// @dev Happy-path tests: cases 1, 2, 3, 22, 23, 24, and name boundary tests.
contract SplitDistributorHappyTest is SplitDistributorTestBase {

    // -----------------------------------------------------------------------
    // Case 1: Single recipient (1 recipient, 10000 bps)
    // -----------------------------------------------------------------------
    function test_SingleRecipient() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        uint256 id = dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);

        assertEq(id, 1);
        assertEq(usdc.balanceOf(alice), ONE_USDC);
        assertEq(usdc.balanceOf(payer), 0);
    }

    // -----------------------------------------------------------------------
    // Case 2: Multi-recipient 40/25/20/15 of 100 USDC
    // -----------------------------------------------------------------------
    function test_MultiRecipient_40_25_20_15() public {
        _fund(HUNDRED_USDC);

        address[] memory r = new address[](4);
        r[0] = alice; r[1] = bob; r[2] = carol; r[3] = dave;

        uint16[] memory b = new uint16[](4);
        b[0] = 4000; b[1] = 2500; b[2] = 2000; b[3] = 1500;

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, HUNDRED_USDC, r, b);

        assertEq(usdc.balanceOf(alice), 40e6,  "alice 40%");
        assertEq(usdc.balanceOf(bob),   25e6,  "bob 25%");
        assertEq(usdc.balanceOf(carol), 20e6,  "carol 20%");
        assertEq(usdc.balanceOf(dave),  15e6,  "dave 15%");
        assertEq(usdc.balanceOf(payer), 0,     "payer drained");
    }

    // -----------------------------------------------------------------------
    // Case 3: Non-even division: 100 units over 3x3333/3333/3334 bps
    //         Remainder goes to last; sum == totalAmount
    // -----------------------------------------------------------------------
    function test_NonEvenDivision_RemainderToLast() public {
        uint256 total = 100; // 100 raw units
        _fund(total);

        address[] memory r = new address[](3);
        r[0] = alice; r[1] = bob; r[2] = carol;

        uint16[] memory b = new uint16[](3);
        b[0] = 3333; b[1] = 3333; b[2] = 3334;

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, total, r, b);

        uint256 aliceAmt = (total * 3333) / 10_000; // floor = 33
        uint256 bobAmt   = (total * 3333) / 10_000; // floor = 33
        uint256 carolAmt = total - aliceAmt - bobAmt; // 34 — remainder

        assertEq(usdc.balanceOf(alice), aliceAmt, "alice floor");
        assertEq(usdc.balanceOf(bob),   bobAmt,   "bob floor");
        assertEq(usdc.balanceOf(carol), carolAmt, "carol remainder");

        // Critical: sum == totalAmount
        assertEq(
            usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol),
            total,
            "sum == totalAmount"
        );
        assertEq(usdc.balanceOf(payer), 0, "payer drained");
    }

    // -----------------------------------------------------------------------
    // Case 22: Repeated calls increment distributionId (1, 2, 3)
    // -----------------------------------------------------------------------
    function test_DistributionIdIncrements() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        _fund(ONE_USDC * 3);

        vm.startPrank(payer);
        uint256 id1 = dist.distribute("dist1", ONE_USDC, r, b);
        uint256 id2 = dist.distribute("dist2", ONE_USDC, r, b);
        uint256 id3 = dist.distribute("dist3", ONE_USDC, r, b);
        vm.stopPrank();

        assertEq(id1, 1, "first id");
        assertEq(id2, 2, "second id");
        assertEq(id3, 3, "third id");
        assertEq(dist.distributionCount(), 3, "distributionCount");
    }

    // -----------------------------------------------------------------------
    // Case 23: Event Distributed — verify all fields
    // -----------------------------------------------------------------------
    function test_Event_Distributed_AllFields() public {
        _fund(HUNDRED_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 6000; b[1] = 4000;

        string memory distName = "My Distribution";
        bytes32 expectedNameHash = keccak256(bytes(distName));

        uint256[] memory expectedAmounts = new uint256[](2);
        expectedAmounts[0] = (HUNDRED_USDC * 6000) / 10_000; // 60e6
        expectedAmounts[1] = HUNDRED_USDC - expectedAmounts[0]; // 40e6 (remainder)

        // Expect the event with all indexed topics + data checked
        vm.expectEmit(true, true, true, true, address(dist));
        emit SplitDistributor.Distributed(
            1,
            payer,
            expectedNameHash,
            distName,
            HUNDRED_USDC,
            r,
            b,
            expectedAmounts
        );

        vm.prank(payer);
        dist.distribute(distName, HUNDRED_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 24: Contract holds zero USDC balance after every successful call
    // -----------------------------------------------------------------------
    function test_ContractHoldsZeroBalanceAfterDistribute() public {
        _fund(HUNDRED_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000; b[1] = 5000;

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, HUNDRED_USDC, r, b);

        assertEq(usdc.balanceOf(address(dist)), 0, "distributor holds no USDC");
    }

    // -----------------------------------------------------------------------
    // Name boundary: 0 bytes → InvalidName
    // -----------------------------------------------------------------------
    function test_Name_EmptyReverts() public {
        _fund(ONE_USDC);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(SplitDistributor.InvalidName.selector);
        dist.distribute("", ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Name boundary: 65 bytes → InvalidName
    // -----------------------------------------------------------------------
    function test_Name_65BytesReverts() public {
        _fund(ONE_USDC);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        // Construct a 65-byte string
        string memory longName = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 65 A's
        require(bytes(longName).length == 65, "sanity: must be 65 bytes");

        vm.prank(payer);
        vm.expectRevert(SplitDistributor.InvalidName.selector);
        dist.distribute(longName, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Name boundary: 1 byte → valid
    // -----------------------------------------------------------------------
    function test_Name_1ByteIsValid() public {
        _fund(ONE_USDC);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        uint256 id = dist.distribute("A", ONE_USDC, r, b);
        assertEq(id, 1);
    }

    // -----------------------------------------------------------------------
    // Name boundary: 64 bytes → valid
    // -----------------------------------------------------------------------
    function test_Name_64BytesIsValid() public {
        _fund(ONE_USDC);
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        string memory name64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 64 A's
        require(bytes(name64).length == 64, "sanity: must be 64 bytes");

        vm.prank(payer);
        uint256 id = dist.distribute(name64, ONE_USDC, r, b);
        assertEq(id, 1);
    }

    // -----------------------------------------------------------------------
    // previewAmounts mirrors distribute computation
    // -----------------------------------------------------------------------
    function test_PreviewAmounts_MatchesDistribute() public {
        uint16[] memory b = new uint16[](3);
        b[0] = 3333; b[1] = 3333; b[2] = 3334;

        uint256[] memory preview = dist.previewAmounts(HUNDRED_USDC, b);

        assertEq(preview[0], (HUNDRED_USDC * 3333) / 10_000);
        assertEq(preview[1], (HUNDRED_USDC * 3333) / 10_000);
        assertEq(preview[2], HUNDRED_USDC - preview[0] - preview[1]);
    }
}
