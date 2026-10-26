// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SplitDistributor} from "../SplitDistributor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Shared base for all SplitDistributor test suites.
abstract contract SplitDistributorTestBase is Test {
    // -----------------------------------------------------------------------
    // Actors
    // -----------------------------------------------------------------------
    address internal payer  = makeAddr("payer");
    address internal alice  = makeAddr("alice");
    address internal bob    = makeAddr("bob");
    address internal carol  = makeAddr("carol");
    address internal dave   = makeAddr("dave");

    // -----------------------------------------------------------------------
    // Contracts
    // -----------------------------------------------------------------------
    MockERC20        internal usdc;
    SplitDistributor internal dist;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------
    uint256 internal constant ONE_USDC     = 1e6;
    uint256 internal constant HUNDRED_USDC = 100e6;
    string  internal constant DEFAULT_NAME = "Test Distribution";

    // -----------------------------------------------------------------------
    // setUp — each test inherits this fresh state
    // -----------------------------------------------------------------------
    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        dist = new SplitDistributor(address(usdc));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// @dev Mint `amount` to payer and grant distributor infinite allowance.
    function _fund(uint256 amount) internal {
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(dist), type(uint256).max);
    }

    /// @dev Build a length-n array of unique recipients (alice, bob, carol, dave, then synthetic).
    function _recipients(uint256 n) internal view returns (address[] memory) {
        address[] memory r = new address[](n);
        address[4] memory base = [alice, bob, carol, dave];
        for (uint256 i = 0; i < n; i++) {
            if (i < 4) {
                r[i] = base[i];
            } else {
                // Deterministic unique addresses beyond the first 4
                r[i] = address(uint160(uint256(keccak256(abi.encodePacked("recipient", i)))));
            }
        }
        return r;
    }

    /// @dev Build equal-split bps array summing to 10_000 for n recipients.
    function _equalBps(uint256 n) internal pure returns (uint16[] memory) {
        require(n > 0 && 10_000 % n == 0, "not evenly divisible");
        uint16[] memory b = new uint16[](n);
        uint16 share = uint16(10_000 / n);
        for (uint256 i = 0; i < n; i++) {
            b[i] = share;
        }
        return b;
    }

    /// @dev Build an equal-split bps array that gives each recipient `share` bps,
    ///      with the remainder assigned to the last slot so the total is exactly 10_000.
    function _equalBpsRemainder(uint256 n) internal pure returns (uint16[] memory) {
        require(n > 0, "need recipients");
        uint16[] memory b = new uint16[](n);
        uint16 share = uint16(10_000 / n);
        uint256 assigned;
        for (uint256 i = 0; i + 1 < n; i++) {
            b[i] = share;
            assigned += share;
        }
        b[n - 1] = uint16(10_000 - assigned);
        return b;
    }
}
