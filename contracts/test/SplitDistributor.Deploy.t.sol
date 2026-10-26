// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SplitDistributorTestBase} from "./SplitDistributor.Base.t.sol";
import {SplitDistributor} from "../SplitDistributor.sol";

/// @dev Constructor / deployment validation tests (cases 25-26).
contract SplitDistributorDeployTest is SplitDistributorTestBase {

    // -----------------------------------------------------------------------
    // Case 25: Constructor rejects address(0)
    // -----------------------------------------------------------------------
    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert(SplitDistributor.InvalidUsdcAddress.selector);
        new SplitDistributor(address(0));
    }

    // -----------------------------------------------------------------------
    // Case 26: Constructor rejects codeless address (e.g. address(1))
    // -----------------------------------------------------------------------
    function test_Constructor_RejectsCodelessAddress() public {
        vm.expectRevert(SplitDistributor.InvalidUsdcAddress.selector);
        new SplitDistributor(address(1));
    }

    // -----------------------------------------------------------------------
    // Happy-path constructor: usdc immutable is set correctly
    // -----------------------------------------------------------------------
    function test_Constructor_SetsUsdcImmutable() public view {
        assertEq(address(dist.usdc()), address(usdc));
    }

    // -----------------------------------------------------------------------
    // Happy-path constructor: distributionCount starts at 0
    // -----------------------------------------------------------------------
    function test_Constructor_DistributionCountStartsAtZero() public view {
        assertEq(dist.distributionCount(), 0);
    }

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    function test_Constants_MaxRecipients() public view {
        assertEq(dist.MAX_RECIPIENTS(), 50);
    }

    function test_Constants_BpsDenominator() public view {
        assertEq(dist.BPS_DENOMINATOR(), 10_000);
    }
}
