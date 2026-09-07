// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ICollateralLockHook
/// @notice Vault-facing lock surface for the Veilend demo-pool hook.
interface ICollateralLockHook {
    function registerLock(uint256 positionId) external;
    function unlockPosition(uint256 positionId) external;
    function isLocked(uint256 positionId) external view returns (bool);
}
