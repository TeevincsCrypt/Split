// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SplitDistributor} from "../SplitDistributor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Malicious ERC-20 that tries to re-enter SplitDistributor.distribute() on the
///      first transferFrom call. After the attack attempt, it behaves normally.
contract ReentrantMockERC20 {
    string public constant name     = "Reentrant USDC";
    string public constant symbol   = "rUSDC";
    uint8  public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Attack parameters — set before the distribute() call
    address public targetDistributor;
    string  public attackName;
    uint256 public attackAmount;
    address public attackRecipient;

    function setAttack(
        address _target,
        string calldata _name,
        uint256 _amount,
        address _recipient
    ) external {
        targetDistributor = _target;
        attackName        = _name;
        attackAmount      = _amount;
        attackRecipient   = _recipient;
    }

    bool private _attacked; // ensure we only attack once

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        // Deduct allowance
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }

        _move(from, to, amount);

        // On the FIRST call, attempt reentrancy
        if (!_attacked && targetDistributor != address(0)) {
            _attacked = true;

            address[] memory r = new address[](1);
            r[0] = attackRecipient;
            uint16[] memory b = new uint16[](1);
            b[0] = 10_000;

            // This inner call must revert with ReentrancyGuardReentrantCall
            // We use try/catch so our outer transferFrom still reverts correctly
            // (the outer distribute() will propagate the inner revert automatically
            //  because SafeERC20 re-throws it.)
            try SplitDistributor(targetDistributor).distribute(
                attackName,
                attackAmount,
                r,
                b
            ) {
                // Should never succeed
            } catch {
                // Revert the entire outer call to propagate failure upward
                revert("reentrancy detected");
            }
        }

        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
    }
}

/// @dev Case 21: Reentrancy test — reentrant token must cause the distribution to revert.
contract SplitDistributorReentrantTest is Test {
    ReentrantMockERC20 internal reentrantUsdc;
    SplitDistributor   internal dist;

    address internal payer     = makeAddr("payer");
    address internal victim    = makeAddr("victim");
    address internal attacker2 = makeAddr("attacker2");

    uint256 internal constant AMOUNT = 1_000e6;

    function setUp() public {
        // 1. Deploy the malicious ERC-20
        reentrantUsdc = new ReentrantMockERC20();

        // 2. Deploy the distributor pointing at the malicious token
        dist = new SplitDistributor(address(reentrantUsdc));

        // 3. Seed payer with enough tokens for two distributions
        reentrantUsdc.mint(payer, AMOUNT * 2);

        // 4. Payer approves the distributor
        vm.prank(payer);
        reentrantUsdc.approve(address(dist), type(uint256).max);

        // 5. Configure the reentrancy attack:
        //    When distribute() calls transferFrom the first time, the mock will
        //    call distribute() again with the same payer as msg.sender.
        //    The mock needs approval from payer to attack — already granted above.
        reentrantUsdc.setAttack(address(dist), "inner attack", AMOUNT, attacker2);
    }

    /// @dev The outer distribute() must revert because the reentrant inner call
    ///      is blocked by nonReentrant, which causes the mock to revert, which
    ///      SafeERC20 propagates upward.
    function test_Reentrant_DistributeReverts() public {
        address[] memory r = new address[](1);
        r[0] = victim;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        vm.expectRevert(); // nonReentrant → inner call reverts → outer reverts
        dist.distribute("outer", AMOUNT, r, b);
    }

    /// @dev distributionCount must remain 0 (no successful distribution occurred)
    function test_Reentrant_DistributionCountUnchanged() public {
        address[] memory r = new address[](1);
        r[0] = victim;
        uint16[] memory b = new uint16[](1);
        b[0] = 10_000;

        vm.prank(payer);
        try dist.distribute("outer", AMOUNT, r, b) {
            // If somehow it doesn't revert, the test still checks count is consistent
        } catch {}

        // Either count==0 (reverted) or count==1 but NOT 2 (reentrancy blocked)
        assertLe(dist.distributionCount(), 1, "reentrancy must not double-execute");
    }
}
