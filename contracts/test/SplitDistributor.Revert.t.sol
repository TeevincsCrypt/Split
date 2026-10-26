// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SplitDistributorTestBase} from "./SplitDistributor.Base.t.sol";
import {SplitDistributor} from "../SplitDistributor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Revert-path tests: cases 5-20 and ERC20 error paths.
contract SplitDistributorRevertTest is SplitDistributorTestBase {

    // -----------------------------------------------------------------------
    // Case 5: Zero address recipient → InvalidRecipient(0)
    // -----------------------------------------------------------------------
    function test_Revert_ZeroAddressRecipient() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](1);
        r[0] = address(0);
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.InvalidRecipient.selector, uint256(0)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 6: address(this) as recipient → InvalidRecipient(0)
    // -----------------------------------------------------------------------
    function test_Revert_DistributorAddressAsRecipient() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](1);
        r[0] = address(dist);
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.InvalidRecipient.selector, uint256(0)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 7: USDC token address as recipient → InvalidRecipient(0)
    // -----------------------------------------------------------------------
    function test_Revert_UsdcAddressAsRecipient() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](1);
        r[0] = address(usdc);
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.InvalidRecipient.selector, uint256(0)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 8: Duplicate recipient → DuplicateRecipient(1)
    // -----------------------------------------------------------------------
    function test_Revert_DuplicateRecipient() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = alice; // duplicate
        uint16[] memory b = new uint16[](2);
        b[0] = 5000; b[1] = 5000;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.DuplicateRecipient.selector, uint256(1)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 9: bps sum 9999 → InvalidAllocationTotal(9999)
    // -----------------------------------------------------------------------
    function test_Revert_BpsSumTooLow() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000; b[1] = 4999;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.InvalidAllocationTotal.selector, uint256(9999)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 10: bps sum 10001 → InvalidAllocationTotal(10001)
    // -----------------------------------------------------------------------
    function test_Revert_BpsSumTooHigh() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 5000; b[1] = 5001;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.InvalidAllocationTotal.selector, uint256(10001)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 11: Zero bps entry → ZeroAllocation(0)
    // -----------------------------------------------------------------------
    function test_Revert_ZeroBpsEntry() public {
        _fund(ONE_USDC);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 0; b[1] = 10_000;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.ZeroAllocation.selector, uint256(0)));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 12: Zero totalAmount → ZeroAmount
    // -----------------------------------------------------------------------
    function test_Revert_ZeroTotalAmount() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(SplitDistributor.ZeroAmount.selector);
        dist.distribute(DEFAULT_NAME, 0, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 13: Length mismatch → LengthMismatch
    // -----------------------------------------------------------------------
    function test_Revert_LengthMismatch() public {
        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(SplitDistributor.LengthMismatch.selector);
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 14: Empty arrays → NoRecipients
    // -----------------------------------------------------------------------
    function test_Revert_EmptyArrays() public {
        address[] memory r = new address[](0);
        uint16[] memory b = new uint16[](0);

        vm.prank(payer);
        vm.expectRevert(SplitDistributor.NoRecipients.selector);
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 15: > MAX_RECIPIENTS recipients → TooManyRecipients(51)
    // -----------------------------------------------------------------------
    function test_Revert_TooManyRecipients() public {
        uint256 n = 51;
        address[] memory r = _recipients(n);
        uint16[] memory b = _equalBpsRemainder(n);

        _fund(ONE_USDC);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.TooManyRecipients.selector, n));
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 16: AllocationRoundsToZero — 1 unit total, 2 bps for first recipient
    //          (1 * 2) / 10000 = 0 → AllocationRoundsToZero(0)
    // -----------------------------------------------------------------------
    function test_Revert_AllocationRoundsToZero() public {
        _fund(1);

        address[] memory r = new address[](2);
        r[0] = alice; r[1] = bob;
        uint16[] memory b = new uint16[](2);
        b[0] = 2;      // (1 * 2) / 10000 = 0 → rounds to zero
        b[1] = 9998;

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SplitDistributor.AllocationRoundsToZero.selector, uint256(0)));
        dist.distribute(DEFAULT_NAME, 1, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 17: Insufficient allowance → reverts (SafeERC20 path)
    // -----------------------------------------------------------------------
    function test_Revert_InsufficientAllowance() public {
        usdc.mint(payer, ONE_USDC);
        // payer does NOT approve distributor

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20 wraps the revert; message may vary
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 18: Insufficient balance → reverts (SafeERC20 path)
    // -----------------------------------------------------------------------
    function test_Revert_InsufficientBalance() public {
        // Approve but do NOT mint any tokens
        vm.prank(payer);
        usdc.approve(address(dist), type(uint256).max);

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20 wraps the revert
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 19: Token returning false on transferFrom → reverts via SafeERC20
    // -----------------------------------------------------------------------
    function test_Revert_TokenReturnsFalseOnTransfer() public {
        // Deploy a fresh mock that returns false on transfer and etch at usdc address
        MockERC20 falseMock = new MockERC20("FalseUSDC", "fUSDC", 6);
        falseMock.mint(payer, ONE_USDC);
        falseMock.setReturnFalseOnTransfer(true);
        vm.etch(address(usdc), address(falseMock).code);

        // After etch, storage is empty — re-mint and re-approve via the rebound handle
        MockERC20 etchedUsdc = MockERC20(address(usdc));
        etchedUsdc.mint(payer, ONE_USDC);
        vm.prank(payer);
        etchedUsdc.approve(address(dist), type(uint256).max);
        etchedUsdc.setReturnFalseOnTransfer(true);

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(); // SafeERC20: SafeTransferFrom reverts on false return
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }

    // -----------------------------------------------------------------------
    // Case 20: Token that reverts on transferFrom → reverts
    // -----------------------------------------------------------------------
    function test_Revert_TokenRevertsOnTransfer() public {
        MockERC20 revertMock = new MockERC20("RevertUSDC", "rUSDC", 6);
        revertMock.mint(payer, ONE_USDC);
        revertMock.setRevertOnTransfer(true);
        vm.etch(address(usdc), address(revertMock).code);

        MockERC20 etchedUsdc = MockERC20(address(usdc));
        etchedUsdc.mint(payer, ONE_USDC);
        vm.prank(payer);
        etchedUsdc.approve(address(dist), type(uint256).max);
        etchedUsdc.setRevertOnTransfer(true);

        address[] memory r = new address[](1);
        r[0] = alice;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert();
        dist.distribute(DEFAULT_NAME, ONE_USDC, r, b);
    }
}
