// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @dev Minimal ERC-20 mock with mint, configurable transfer behavior, and reentrancy capability.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    // Transfer behavior control
    bool public returnFalseOnTransfer;
    bool public revertOnTransfer;

    // Reentrancy attack fields
    bool public reentrantMode;
    address public reentrantTarget;
    bytes public reentrantCalldata;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (revertOnTransfer) revert("MockERC20: transfer reverted");
        if (returnFalseOnTransfer) return false;
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (revertOnTransfer) revert("MockERC20: transfer reverted");
        if (returnFalseOnTransfer) return false;

        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "MockERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
        }

        _transfer(from, to, amount);

        // Reentrancy attack: attempt to call the target after state changes
        if (reentrantMode) {
            reentrantMode = false; // prevent infinite loop
            (bool success,) = reentrantTarget.call(reentrantCalldata);
            // We do NOT check success — we just attempt the call
            // The test checks that the outer call reverts
            success; // silence unused variable warning
        }

        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "MockERC20: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    // --- Control functions ---

    function setReturnFalseOnTransfer(bool val) external {
        returnFalseOnTransfer = val;
    }

    function setRevertOnTransfer(bool val) external {
        revertOnTransfer = val;
    }

    /// @dev Configure a one-shot reentrancy attack.
    function setReentrantAttack(address target, bytes calldata data) external {
        reentrantMode = true;
        reentrantTarget = target;
        reentrantCalldata = data;
    }
}
