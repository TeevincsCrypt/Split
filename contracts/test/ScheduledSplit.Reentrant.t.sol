// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ScheduledSplitBase} from "./ScheduledSplit.Base.t.sol";
import {ScheduledSplit} from "../ScheduledSplit.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Tests that ReentrancyGuard blocks re-entrant calls through a malicious token.
/// The MockERC20 supports a one-shot reentrancy attack on `transferFrom` or `transfer`.
contract ScheduledSplitReentrantTest is ScheduledSplitBase {

    // ─── Override setUp to use a fresh malicious-capable mock ────────────────

    MockERC20 internal malToken;
    ScheduledSplit internal malSS;

    function setUp() public override {
        super.setUp();

        // Deploy a second mock token used for attack tests
        malToken = new MockERC20("Mal USDC", "mUSDC", 6);
        malSS = new ScheduledSplit(address(malToken));

        // Fund payer for malToken
        malToken.mint(payer, 1_000_000e6);
        vm.prank(payer);
        malToken.approve(address(malSS), type(uint256).max);
    }

    // ─── Reentrancy on execute via malicious token.transfer ──────────────────

    /// @dev During execute, safeTransfer calls token.transfer to recipient.
    /// MockERC20 reenters execute(id) from within transfer. ReentrancyGuard must block it.
    function test_Reentrant_Execute_Blocked() public {
        // Create schedule so that first payment goes to alice
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0 + 1 days);

        vm.prank(payer);
        uint256 id = malSS.createSchedule("Mal", r, _bps1(), AMOUNT, d);

        vm.warp(T0 + 1 days);

        // Configure reentrant attack: token.transfer will call malSS.execute(id) again
        bytes memory attackData = abi.encodeWithSignature("execute(uint256)", id);
        malToken.setReentrantAttack(address(malSS), attackData);

        // The outer execute must succeed (ReentrancyGuard rejects the nested call,
        // but the outer call itself should complete because MockERC20 ignores
        // the nested call's success/failure). The important check is that
        // the contract ends in a consistent state — executed == 1 and balance is correct.
        malSS.execute(id);

        // State must be consistent: exactly 1 payment executed
        ScheduledSplit.Schedule memory s = malSS.getSchedule(id);
        assertEq(s.executed, 1);

        // Contract holds zero remaining funds (1-payment schedule)
        assertEq(malToken.balanceOf(address(malSS)), 0);
    }

    // ─── Reentrancy on cancel via malicious token.transfer ───────────────────

    /// @dev During cancel, safeTransfer calls token.transfer to payer.
    /// MockERC20 reenters cancel(id). ReentrancyGuard must block the nested call.
    function test_Reentrant_Cancel_Blocked() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0 + 1 days);

        vm.prank(payer);
        uint256 id = malSS.createSchedule("MalCancel", r, _bps1(), AMOUNT, d);

        // Configure reentrant attack: token.transfer will call malSS.cancel(id) again
        bytes memory attackData = abi.encodeWithSignature("cancel(uint256)", id);
        malToken.setReentrantAttack(address(malSS), attackData);

        // Outer cancel should complete; nested cancel should be blocked by ReentrancyGuard
        vm.prank(payer);
        malSS.cancel(id);

        // State must be consistent: schedule is cancelled and payer got full refund
        ScheduledSplit.Schedule memory s = malSS.getSchedule(id);
        assertTrue(s.cancelled);
        assertEq(malToken.balanceOf(address(malSS)), 0);
    }

    // ─── Reentrancy on createSchedule via malicious token.transferFrom ────────

    /// @dev During createSchedule, safeTransferFrom calls token.transferFrom.
    /// MockERC20 reenters createSchedule. ReentrancyGuard must block the nested call.
    function test_Reentrant_Create_Blocked() public {
        address[] memory r = new address[](1);
        r[0] = alice;
        uint64[] memory d = new uint64[](1);
        d[0] = uint64(T0 + 1 days);

        // Configure reentrant attack: transferFrom will call createSchedule again
        bytes memory attackData = abi.encodeWithSignature(
            "createSchedule(string,address[],uint16[],uint96,uint64[])",
            "Nested",
            r,
            _bps1(),
            AMOUNT,
            d
        );
        malToken.setReentrantAttack(address(malSS), attackData);

        // Outer createSchedule should complete; nested should be blocked
        vm.prank(payer);
        malSS.createSchedule("Outer", r, _bps1(), AMOUNT, d);

        // Only 1 schedule was created (nested was blocked, scheduleCount == 1)
        assertEq(malSS.scheduleCount(), 1);
    }
}
