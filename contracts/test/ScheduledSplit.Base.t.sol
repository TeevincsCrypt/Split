// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Shared base for all ScheduledSplit test suites.
abstract contract ScheduledSplitBase is Test {
    // ─── actors ───────────────────────────────────────────────────────────────
    address internal payer   = makeAddr("payer");
    address internal alice   = makeAddr("alice");
    address internal bob     = makeAddr("bob");
    address internal charlie = makeAddr("charlie");
    address internal executor = makeAddr("executor");

    // ─── contracts ────────────────────────────────────────────────────────────
    MockERC20        internal token;
    ScheduledSplit   internal ss;

    // ─── constants ────────────────────────────────────────────────────────────
    uint96  internal constant AMOUNT  = 1_000e6; // 1 000 USDC (6 dec mock)
    uint256 internal constant T0      = 1_000_000; // base timestamp
    uint64  internal constant DUE1    = uint64(T0 + 1 days);
    uint64  internal constant DUE2    = uint64(T0 + 2 days);
    uint64  internal constant DUE3    = uint64(T0 + 3 days);

    // ─── setUp ────────────────────────────────────────────────────────────────
    function setUp() public virtual {
        // Ensure deterministic block.timestamp
        vm.warp(T0);

        // Deploy mock token (6 decimals, like USDC)
        token = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy ScheduledSplit with the mock token
        ss = new ScheduledSplit(address(token));

        // Fund payer generously
        _fund(payer, 1_000_000e6);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    /// @dev Fund an account and approve the ScheduledSplit contract.
    function _fund(address who, uint256 amount) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(ss), type(uint256).max);
    }

    /// @dev Build a simple single-recipient bps array.
    function _bps1() internal pure returns (uint16[] memory b) {
        b = new uint16[](1);
        b[0] = 10_000;
    }

    /// @dev Build a [3333, 3333, 3334] bps array (3 recipients).
    function _bps3() internal pure returns (uint16[] memory b) {
        b = new uint16[](3);
        b[0] = 3333;
        b[1] = 3333;
        b[2] = 3334;
    }

    /// @dev Build a [5000, 5000] bps array.
    function _bps2() internal pure returns (uint16[] memory b) {
        b = new uint16[](2);
        b[0] = 5000;
        b[1] = 5000;
    }

    /// @dev Single-payment dueTimes array.
    function _due1() internal pure returns (uint64[] memory d) {
        d = new uint64[](1);
        d[0] = DUE1;
    }

    /// @dev Three-payment dueTimes array.
    function _due3() internal pure returns (uint64[] memory d) {
        d = new uint64[](3);
        d[0] = DUE1;
        d[1] = DUE2;
        d[2] = DUE3;
    }

    /// @dev 12-payment monthly dueTimes array (from T0+1 day to T0+12 days).
    function _due12() internal pure returns (uint64[] memory d) {
        d = new uint64[](12);
        for (uint256 i = 0; i < 12; ++i) {
            d[i] = uint64(T0 + (i + 1) * 1 days);
        }
    }

    /// @dev 24-payment dueTimes array.
    function _due24() internal pure returns (uint64[] memory d) {
        d = new uint64[](24);
        for (uint256 i = 0; i < 24; ++i) {
            d[i] = uint64(T0 + (i + 1) * 1 days);
        }
    }

    /// @dev Build a recipients array with n addresses (derived deterministically).
    function _makeRecipients(uint256 n) internal pure returns (address[] memory r) {
        r = new address[](n);
        for (uint256 i = 0; i < n; ++i) {
            // Use address(uint160(0xBEEF0000 + i)) — never zero, never contract
            r[i] = address(uint160(0xBEEF0000 + i));
        }
    }

    /// @dev Build equal-split bps for n recipients (last gets remainder).
    function _equalBps(uint256 n) internal pure returns (uint16[] memory b) {
        b = new uint16[](n);
        uint16 share = uint16(10_000 / n);
        uint16 remainder = uint16(10_000 - share * uint16(n));
        for (uint256 i = 0; i < n - 1; ++i) {
            b[i] = share;
        }
        b[n - 1] = share + remainder;
    }

    /// @dev Convenience: create a standard single-recipient, single-payment schedule.
    function _createSimple() internal returns (uint256 id) {
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(payer);
        id = ss.createSchedule("Simple", r, _bps1(), AMOUNT, _due1());
    }

    /// @dev Convenience: create a 3-recipient, 3-payment schedule.
    function _createTriple() internal returns (uint256 id) {
        address[] memory r = new address[](3);
        r[0] = alice;
        r[1] = bob;
        r[2] = charlie;
        vm.prank(payer);
        id = ss.createSchedule("Triple", r, _bps3(), AMOUNT, _due3());
    }
}
