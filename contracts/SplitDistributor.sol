// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SplitDistributor
/// @notice Performs non-custodial USDC split distributions in a single atomic transaction.
/// @dev The contract does not custody funds between transactions. It pulls directly from the payer to recipients.
contract SplitDistributor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Reverts when recipients and bps arrays have different lengths.
    error LengthMismatch();

    /// @notice Reverts when no recipients are provided.
    error NoRecipients();

    /// @notice Reverts when recipient count exceeds MAX_RECIPIENTS.
    /// @param count The number of recipients provided.
    error TooManyRecipients(uint256 count);

    /// @notice Reverts when totalAmount is zero.
    error ZeroAmount();

    /// @notice Reverts when distribution name length is outside [1, 64].
    error InvalidName();

    /// @notice Reverts when the USDC address passed to the constructor is invalid.
    error InvalidUsdcAddress();

    /// @notice Reverts when a recipient is invalid.
    /// @param index The index of the invalid recipient.
    error InvalidRecipient(uint256 index);

    /// @notice Reverts when a recipient appears more than once.
    /// @param index The index where a duplicate recipient was found.
    error DuplicateRecipient(uint256 index);

    /// @notice Reverts when a basis-point allocation is zero.
    /// @param index The index of the zero allocation.
    error ZeroAllocation(uint256 index);

    /// @notice Reverts when the sum of all basis-point allocations is not 10,000.
    /// @param sum The computed basis-point total.
    error InvalidAllocationTotal(uint256 sum);

    /// @notice Reverts when computed allocation for a recipient rounds down to zero.
    /// @param index The index whose computed allocation is zero.
    error AllocationRoundsToZero(uint256 index);

    /// @notice Emitted after a successful distribution.
    /// @param distributionId Monotonically increasing distribution identifier.
    /// @param payer The account that paid USDC for the distribution.
    /// @param nameHash Keccak-256 hash of `name`.
    /// @param name Human-readable distribution label.
    /// @param totalAmount Total amount of USDC distributed.
    /// @param recipients Recipient addresses.
    /// @param bps Basis-point allocations corresponding to recipients.
    /// @param amounts Final token amounts transferred to each recipient.
    event Distributed(
        uint256 indexed distributionId,
        address indexed payer,
        bytes32 indexed nameHash,
        string name,
        uint256 totalAmount,
        address[] recipients,
        uint16[] bps,
        uint256[] amounts
    );

    /// @notice Maximum recipients per distribution, chosen to remain comfortably below block gas limits.
    uint16 public constant MAX_RECIPIENTS = 50;

    /// @notice Basis-point denominator used for split allocations.
    uint16 public constant BPS_DENOMINATOR = 10_000;

    /// @notice USDC token used for all distributions.
    IERC20 public immutable usdc;

    /// @notice Counter of successful distributions.
    uint256 public distributionCount;

    /// @notice Creates the distributor and pins the USDC token contract.
    /// @param usdc_ Verified official USDC token address. Must be non-zero and have deployed code.
    constructor(address usdc_) {
        if (usdc_ == address(0) || usdc_.code.length == 0) {
            revert InvalidUsdcAddress();
        }
        usdc = IERC20(usdc_);
    }

    /// @notice Distributes `totalAmount` USDC from msg.sender to recipients using basis-point allocations.
    /// @dev Reverts on validation failures before any transfer. Uses nonReentrant for interaction safety.
    ///      This function is intentionally atomic: if any single transfer fails (e.g. a USDC-blocklisted
    ///      recipient, insufficient allowance, or insufficient balance) the entire distribution reverts.
    ///      No partial distributions occur — either all recipients receive their share or none do.
    ///      Off-chain callers should validate recipients against the USDC blocklist before submitting.
    /// @param name Human-readable label for this distribution (length 1..64 bytes).
    /// @param totalAmount Total USDC amount to split (in USDC ERC-20 units, 6 decimals).
    /// @param recipients Recipient addresses.
    /// @param bps Basis-point allocations matching `recipients`.
    /// @return distributionId The new distribution identifier.
    function distribute(
        string calldata name,
        uint256 totalAmount,
        address[] calldata recipients,
        uint16[] calldata bps
    ) external nonReentrant returns (uint256 distributionId) {
        uint256 len = recipients.length;

        if (len != bps.length) {
            revert LengthMismatch();
        }

        if (len == 0) {
            revert NoRecipients();
        }

        if (len > MAX_RECIPIENTS) {
            revert TooManyRecipients(len);
        }

        if (totalAmount == 0) {
            revert ZeroAmount();
        }

        uint256 nameLength = bytes(name).length;
        if (nameLength == 0 || nameLength > 64) {
            revert InvalidName();
        }

        for (uint256 i = 0; i < len; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || recipient == address(this) || recipient == address(usdc)) {
                revert InvalidRecipient(i);
            }

            for (uint256 j = 0; j < i; ++j) {
                if (recipient == recipients[j]) {
                    revert DuplicateRecipient(i);
                }
            }
        }

        uint256[] memory amounts = _computeAmounts(totalAmount, bps);

        distributionId = ++distributionCount;

        for (uint256 i = 0; i < len; ++i) {
            usdc.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
        }

        emit Distributed(
            distributionId,
            msg.sender,
            keccak256(bytes(name)),
            name,
            totalAmount,
            recipients,
            bps,
            amounts
        );
    }

    /// @notice Previews per-recipient amounts for a given `totalAmount` and basis-point allocation.
    /// @dev Runs the same allocation checks and rounding behavior as `distribute`.
    /// @param totalAmount Total amount to split.
    /// @param bps Basis-point allocations.
    /// @return amounts Computed per-recipient distribution amounts.
    function previewAmounts(uint256 totalAmount, uint16[] calldata bps)
        external
        pure
        returns (uint256[] memory amounts)
    {
        return _computeAmounts(totalAmount, bps);
    }

    /// @notice Computes split amounts from basis-point allocations.
    /// @dev For i < n-1, amount is floored division. Last recipient receives the remainder.
    /// Reverts when bps is empty, any allocation is zero, total allocation != 10,000, or any computed amount is zero.
    /// @param totalAmount Total amount to split.
    /// @param bps Basis-point allocations.
    /// @return amounts Computed per-recipient amounts.
    function _computeAmounts(uint256 totalAmount, uint16[] calldata bps)
        internal
        pure
        returns (uint256[] memory amounts)
    {
        uint256 len = bps.length;
        if (len == 0) {
            revert NoRecipients();
        }
        amounts = new uint256[](len);

        uint256 sumBps = 0;
        for (uint256 i = 0; i < len; ++i) {
            uint16 share = bps[i];
            if (share == 0) {
                revert ZeroAllocation(i);
            }
            sumBps += share;
        }

        if (sumBps != BPS_DENOMINATOR) {
            revert InvalidAllocationTotal(sumBps);
        }

        uint256 distributed = 0;
        for (uint256 i = 0; i + 1 < len; ++i) {
            uint256 amount = (totalAmount * bps[i]) / BPS_DENOMINATOR;
            if (amount == 0) {
                revert AllocationRoundsToZero(i);
            }
            amounts[i] = amount;
            distributed += amount;
        }

        uint256 lastIndex = len - 1;
        uint256 lastAmount = totalAmount - distributed;
        if (lastAmount == 0) {
            revert AllocationRoundsToZero(lastIndex);
        }
        amounts[lastIndex] = lastAmount;
    }
}
