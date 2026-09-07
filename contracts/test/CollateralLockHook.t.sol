// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract CollateralLockHookTest is BaseTest {
    using EasyPosm for IPositionManager;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;

    CollateralLockHook hook;

    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();

        // Deploy the hook to an address with the correct flags
        address flags = address(
            uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG) ^ (0x4444 << 144) // Namespace the hook to avoid collisions
        );
        bytes memory constructorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("CollateralLockHook.sol:CollateralLockHook", constructorArgs, flags);
        hook = CollateralLockHook(flags);

        // Create the pool
        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        // Provide full-range liquidity to the pool
        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        // PositionManager sets params.salt = bytes32(tokenId) on modifyLiquidity
        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    function test_unlockedDecrease_ok() public {
        uint256 liquidityToRemove = 1e18;
        positionManager.decreaseLiquidity(
            tokenId, liquidityToRemove, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES
        );
    }

    function test_lockedDecrease_reverts() public {
        hook.setVault(address(this));
        hook.registerLock(tokenId);

        // Call through `this` so EasyPosm's view reads do not consume expectRevert.
        // PoolManager wraps hook reverts as CustomRevert.WrappedError.
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.beforeRemoveLiquidity.selector,
                abi.encodeWithSelector(CollateralLockHook.PositionLocked.selector, tokenId),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        this.decreaseLiquidity(tokenId, 1e18);
    }

    function decreaseLiquidity(uint256 id, uint256 liquidityToRemove) external {
        positionManager.decreaseLiquidity(
            id, liquidityToRemove, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES
        );
    }

    function test_lockedCollectFee_ok() public {
        hook.setVault(address(this));
        hook.registerLock(tokenId);

        positionManager.collect(tokenId, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES);
    }

    function test_permissions() public view {
        Hooks.Permissions memory permissions = hook.getHookPermissions();
        assertTrue(permissions.beforeRemoveLiquidity);
        assertFalse(permissions.beforeInitialize);
        assertFalse(permissions.afterInitialize);
        assertFalse(permissions.beforeAddLiquidity);
        assertFalse(permissions.afterAddLiquidity);
        assertFalse(permissions.afterRemoveLiquidity);
        assertFalse(permissions.beforeSwap);
        assertFalse(permissions.afterSwap);
        assertFalse(permissions.beforeDonate);
        assertFalse(permissions.afterDonate);
        assertFalse(permissions.beforeSwapReturnDelta);
        assertFalse(permissions.afterSwapReturnDelta);
        assertFalse(permissions.afterAddLiquidityReturnDelta);
        assertFalse(permissions.afterRemoveLiquidityReturnDelta);
    }

    function test_registerLock_notVault_reverts() public {
        vm.expectRevert(CollateralLockHook.NotVault.selector);
        hook.registerLock(tokenId);

        hook.setVault(address(this));
        vm.prank(address(0xBEEF));
        vm.expectRevert(CollateralLockHook.NotVault.selector);
        hook.registerLock(tokenId);
    }

    function test_setVault_notOwner_reverts() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(CollateralLockHook.NotOwner.selector);
        hook.setVault(address(this));
    }

    function test_constructor_setsEncodedOwner() public view {
        assertEq(hook.owner(), address(this));
    }

    function test_constructor_zeroOwner_reverts() public {
        // Regular `new` would fail BaseHook flag validation first. Run creation code
        // at a flag-valid address so ZeroAddress is the revert we observe.
        address flags = address(uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG) ^ (0x7777 << 144));
        bytes memory creationCode =
            abi.encodePacked(type(CollateralLockHook).creationCode, abi.encode(poolManager, address(0)));
        vm.etch(flags, creationCode);
        vm.expectRevert(CollateralLockHook.ZeroAddress.selector);
        this.runCreationCode(flags);
    }

    function runCreationCode(address target) external {
        (bool success, bytes memory data) = target.call("");
        if (!success) {
            assembly {
                revert(add(data, 0x20), mload(data))
            }
        }
    }

    function test_unlockPosition() public {
        hook.setVault(address(this));
        hook.registerLock(tokenId);
        assertTrue(hook.isLocked(tokenId));

        hook.unlockPosition(tokenId);
        assertFalse(hook.isLocked(tokenId));

        positionManager.decreaseLiquidity(tokenId, 1e18, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES);
    }
}
