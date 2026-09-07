// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {ICollateralLockHook} from "./interfaces/ICollateralLockHook.sol";

/// @title CollateralLockHook
/// @notice Blocks liquidity decreases on locked Uniswap v4 LP positions.
/// @dev PositionManager keys each position with `salt = bytes32(tokenId)`.
contract CollateralLockHook is BaseHook, ICollateralLockHook {
    address public owner;
    address public vault;

    mapping(uint256 => bool) public locked;

    error NotOwner();
    error NotVault();
    error PositionLocked(uint256 positionId);

    event VaultUpdated(address indexed vault);
    event LockRegistered(uint256 indexed positionId);
    event LockReleased(uint256 indexed positionId);

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
        owner = msg.sender;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function setVault(address _vault) external {
        if (msg.sender != owner) revert NotOwner();
        vault = _vault;
        emit VaultUpdated(_vault);
    }

    function registerLock(uint256 id) external {
        if (msg.sender != vault) revert NotVault();
        locked[id] = true;
        emit LockRegistered(id);
    }

    function unlockPosition(uint256 id) external {
        if (msg.sender != vault) revert NotVault();
        locked[id] = false;
        emit LockReleased(id);
    }

    function isLocked(uint256 id) external view returns (bool) {
        return locked[id];
    }

    function _beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata params, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        uint256 positionId = uint256(params.salt);
        if (locked[positionId] && params.liquidityDelta < 0) {
            revert PositionLocked(positionId);
        }
        return BaseHook.beforeRemoveLiquidity.selector;
    }
}
