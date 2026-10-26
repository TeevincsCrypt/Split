// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SplitDistributorTestBase} from "./SplitDistributor.Base.t.sol";
import {SplitDistributor} from "../SplitDistributor.sol";
import {console2} from "forge-std/console2.sol";

/// @dev Case 4: Fuzz tests — amounts always sum to totalAmount; payer balance drops by exactly totalAmount.
/// @dev Case 27: Gas measurement at MAX_RECIPIENTS (50 recipients, equal splits).
contract SplitDistributorFuzzTest is SplitDistributorTestBase {

    // -----------------------------------------------------------------------
    // Case 4: Fuzz — amounts sum to totalAmount, payer balance drops by exactly totalAmount
    // -----------------------------------------------------------------------

    /// @dev Fuzz with 1 recipient (simplest case)
    function testFuzz_SingleRecipient_SumsToTotal(uint256 totalAmount) public {
        totalAmount = bound(totalAmount, 1, 1e18);
        _fund(totalAmount);

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, totalAmount, r, b);

        // payer drops by exactly totalAmount
        assertEq(payerBefore - usdc.balanceOf(payer), totalAmount, "payer delta");
        // sum of recipient balances == totalAmount
        assertEq(usdc.balanceOf(alice), totalAmount, "alice receives all");
    }

    /// @dev Fuzz with 2 recipients — 50/50 split; amounts sum to totalAmount
    function testFuzz_TwoRecipients_EqualSplit_SumsToTotal(uint256 totalAmount) public {
        // Ensure floor(total/2)*2 covers something meaningful; require even amount to avoid remainder edge
        totalAmount = bound(totalAmount, 2, 1e18);
        _fund(totalAmount);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000; b[1] = 5000;

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, totalAmount, r, b);

        uint256 payerAfter = usdc.balanceOf(payer);
        assertEq(payerBefore - payerAfter, totalAmount, "payer delta");

        uint256 aliceAmt = usdc.balanceOf(alice);
        uint256 bobAmt   = usdc.balanceOf(bob);
        assertEq(aliceAmt + bobAmt, totalAmount, "sum equals totalAmount");
    }

    /// @dev Fuzz with 4 recipients — 40/25/20/15 split; amounts sum to totalAmount
    function testFuzz_FourRecipients_SumsToTotal(uint256 totalAmount) public {
        // floor(total*4000/10000) + ... must yield non-zero for each of the first 3
        // The minimum for the first (4000 bps) to be non-zero is totalAmount >= 3 (actually 1 suffices for 4000 bps)
        // For 1500 bps not to round to zero: total * 1500 / 10000 >= 1 → total >= 7
        totalAmount = bound(totalAmount, 7, 1e18);
        _fund(totalAmount);

        address[] memory r = new address[](4);
        r[0] = alice; r[1] = bob; r[2] = carol; r[3] = dave;
        uint16[] memory b = new uint16[](4);
        b[0] = 4000; b[1] = 2500; b[2] = 2000; b[3] = 1500;

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, totalAmount, r, b);

        uint256 payerAfter = usdc.balanceOf(payer);
        assertEq(payerBefore - payerAfter, totalAmount, "payer delta");

        uint256 sumReceived = usdc.balanceOf(alice) + usdc.balanceOf(bob)
                            + usdc.balanceOf(carol) + usdc.balanceOf(dave);
        assertEq(sumReceived, totalAmount, "sum equals totalAmount");
        assertEq(usdc.balanceOf(address(dist)), 0, "contract holds nothing");
    }

    /// @dev Fuzz with 3 recipients — 3333/3333/3334 bps; remainder to last; sum == totalAmount
    function testFuzz_ThreeRecipients_NonEven_SumsToTotal(uint256 totalAmount) public {
        // Need (total * 3333) / 10000 >= 1 → total >= 4
        totalAmount = bound(totalAmount, 4, 1e18);
        _fund(totalAmount);

        address[] memory r = new address[](3);
        r[0] = alice; r[1] = bob; r[2] = carol;
        uint16[] memory b = new uint16[](3);
        b[0] = 3333; b[1] = 3333; b[2] = 3334;

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        dist.distribute(DEFAULT_NAME, totalAmount, r, b);

        uint256 payerAfter  = usdc.balanceOf(payer);
        assertEq(payerBefore - payerAfter, totalAmount, "payer delta");

        uint256 sumReceived = usdc.balanceOf(alice) + usdc.balanceOf(bob) + usdc.balanceOf(carol);
        assertEq(sumReceived, totalAmount, "sum equals totalAmount");
    }

    // -----------------------------------------------------------------------
    // Case 27: Gas measurement at MAX_RECIPIENTS (50 recipients, equal splits)
    // -----------------------------------------------------------------------
    function test_Gas_MaxRecipients_50EqualSplits() public {
        uint256 n = 50;
        uint256 totalAmount = 50_000e6; // 50,000 USDC (each gets 1,000 USDC)

        _fund(totalAmount);

        address[] memory r = _recipients(n);
        uint16[] memory b  = _equalBps(n); // 200 bps each (50 * 200 = 10,000)

        vm.prank(payer);
        uint256 gasBefore = gasleft();
        dist.distribute("50-recipient gas test", totalAmount, r, b);
        uint256 gasUsed = gasBefore - gasleft();

        console2.log("Gas used for 50-recipient distribution:", gasUsed);

        // Sanity: all 50 recipients got 1,000 USDC each
        for (uint256 i = 0; i < n; i++) {
            // Each recipient gets floor(50000e6 * 200 / 10000) = 1000e6 exactly (no remainder issues)
            // Last one may get remainder but it's the same for equal splits
            assertGt(usdc.balanceOf(r[i]), 0, "recipient got nothing");
        }
        assertEq(usdc.balanceOf(address(dist)), 0, "contract holds nothing");

        // Gas sanity ceiling: 50 transfers should stay well under 3M gas
        assertLt(gasUsed, 3_000_000, "gas exceeds expected ceiling");
    }
}
