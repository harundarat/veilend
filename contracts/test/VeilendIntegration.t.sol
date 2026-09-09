// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Integration tests for CollateralLockHook + LendingVault + the Veilend demo pool.
/// @dev Path A: real PositionManager.mint; positionId = tokenId.
///      PositionManager sets salt = bytes32(tokenId) on modifyLiquidity.
///      Hook and vault both key locks as uint256(params.salt) == tokenId.

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";
import {LendingVault} from "../src/LendingVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract VeilendIntegrationTest is BaseTest {
    using EasyPosm for IPositionManager;
    using StateLibrary for IPoolManager;

    uint128 internal constant LIQUIDITY_AMOUNT = 100e18;
    uint256 internal constant VAULT_PREFUND = 1_000_000e18;

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;

    CollateralLockHook hook;
    LendingVault vault;
    MockERC20 loanToken;

    address relayer;

    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();

        relayer = makeAddr("relayer");

        // Flag-valid hook address. Flags must match getHookPermissions() (beforeRemoveLiquidity only).
        address flags = address(
            uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG) ^ (0x6666 << 144)
        );
        bytes memory constructorArgs = abi.encode(poolManager, address(this));
        deployCodeTo("CollateralLockHook.sol:CollateralLockHook", constructorArgs, flags);
        hook = CollateralLockHook(flags);

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            LIQUIDITY_AMOUNT
        );

        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            LIQUIDITY_AMOUNT,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );

        loanToken = new MockERC20("Mock Stable", "mUSD");
        vault = new LendingVault(
            IPositionManager(address(positionManager)), hook, loanToken, relayer, poolKey
        );
        hook.setVault(address(vault));
        loanToken.mint(address(vault), VAULT_PREFUND);
    }

    function test_demoPool_initializesWithHook() public view {
        assertEq(address(poolKey.hooks), address(hook));
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolKey.toId());
        assertEq(sqrtPriceX96, Constants.SQRT_PRICE_1_1);
    }

    function test_addLiquidity_unlocked_succeeds() public {
        uint128 extra = 10e18;
        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            extra
        );

        uint128 beforeLiq = positionManager.getPositionLiquidity(tokenId);
        positionManager.increaseLiquidity(
            tokenId, extra, amount0Expected + 1, amount1Expected + 1, block.timestamp, Constants.ZERO_BYTES
        );
        assertEq(positionManager.getPositionLiquidity(tokenId), beforeLiq + extra);
    }

    function test_decrease_unlocked_succeeds() public {
        uint128 beforeLiq = positionManager.getPositionLiquidity(tokenId);
        positionManager.decreaseLiquidity(
            tokenId, 1e18, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES
        );
        assertEq(positionManager.getPositionLiquidity(tokenId), beforeLiq - 1e18);
    }

    function test_lockThenDecrease_reverts() public {
        _approveAndLock();
        assertTrue(hook.isLocked(tokenId));

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

    function test_lockThenCollect_succeeds() public {
        _approveAndLock();
        assertTrue(hook.isLocked(tokenId));

        positionManager.collect(tokenId, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES);
        assertEq(positionManager.getPositionLiquidity(tokenId), LIQUIDITY_AMOUNT);
    }

    function test_vaultLockPosition_sideEffects() public {
        IERC721 nft = IERC721(address(positionManager));
        nft.approve(address(vault), tokenId);

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.PositionLocked(address(this), tokenId, block.timestamp);

        vault.lockPosition(tokenId);

        assertTrue(hook.isLocked(tokenId));
        assertTrue(vault.locked(tokenId));
        assertEq(nft.ownerOf(tokenId), address(this));

        LendingVault.Loan memory loan = vault.getLoan(tokenId);
        assertEq(loan.borrower, address(this));
        assertEq(loan.positionId, tokenId);
        assertTrue(loan.locked);
        assertFalse(loan.active);
    }

    function test_lockPosition_wrongPool_reverts() public {
        PoolKey memory otherKey = PoolKey(currency0, currency1, 500, 10, IHooks(address(0)));
        poolManager.initialize(otherKey, Constants.SQRT_PRICE_1_1);

        int24 otherLower = TickMath.minUsableTick(otherKey.tickSpacing);
        int24 otherUpper = TickMath.maxUsableTick(otherKey.tickSpacing);

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(otherLower),
            TickMath.getSqrtPriceAtTick(otherUpper),
            LIQUIDITY_AMOUNT
        );

        (uint256 otherId,) = positionManager.mint(
            otherKey,
            otherLower,
            otherUpper,
            LIQUIDITY_AMOUNT,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );

        IERC721(address(positionManager)).approve(address(vault), otherId);
        vm.expectRevert(LendingVault.NotDemoPool.selector);
        vault.lockPosition(otherId);
    }

    function test_submitCreditReport_afterLock() public {
        _approveAndLock();

        uint256 ltvBps = 5000;
        uint256 expectedPrincipal = uint256(LIQUIDITY_AMOUNT) * ltvBps / 10_000;
        uint256 vaultBefore = loanToken.balanceOf(address(vault));
        uint256 borrowerBefore = loanToken.balanceOf(address(this));
        uint256 expiry = block.timestamp + 1 days;

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.CreditReportSubmitted(address(this), tokenId, ltvBps, 1000, expiry, expectedPrincipal);

        vm.prank(relayer);
        vault.submitCreditReport(address(this), tokenId, ltvBps, 1000, expiry);

        assertEq(loanToken.balanceOf(address(this)), borrowerBefore + expectedPrincipal);
        assertEq(loanToken.balanceOf(address(vault)), vaultBefore - expectedPrincipal);

        LendingVault.Loan memory loan = vault.getLoan(tokenId);
        assertTrue(loan.active);
        assertEq(loan.principal, expectedPrincipal);
        assertEq(loan.collateralValue, uint256(LIQUIDITY_AMOUNT));
        assertEq(loan.ltvBps, ltvBps);
        assertEq(loan.aprBps, 1000);
        assertEq(loan.expiry, expiry);
        assertEq(loan.defaultDeadline, expiry + vault.GRACE_PERIOD());
        assertTrue(hook.isLocked(tokenId));
        assertEq(IERC721(address(positionManager)).ownerOf(tokenId), address(this));
    }

    function test_repayLoan_unlocksAndAllowsDecrease() public {
        _approveAndLock();

        uint256 ltvBps = 5000;
        uint256 aprBps = 1000;
        uint256 expiry = block.timestamp + 1 days;
        uint256 principal = uint256(LIQUIDITY_AMOUNT) * ltvBps / 10_000;
        uint256 repayAmount = principal + (principal * aprBps / 10_000);

        vm.prank(relayer);
        vault.submitCreditReport(address(this), tokenId, ltvBps, aprBps, expiry);

        this.decreaseLiquidityExpectLocked(tokenId, 1e18);

        loanToken.mint(address(this), principal * aprBps / 10_000);
        loanToken.approve(address(vault), repayAmount);

        uint256 vaultBefore = loanToken.balanceOf(address(vault));
        vault.repayLoan(tokenId);
        assertEq(loanToken.balanceOf(address(vault)), vaultBefore + repayAmount);
        assertFalse(hook.isLocked(tokenId));
        assertFalse(vault.locked(tokenId));
        assertTrue(vault.getLoan(tokenId).repaid);

        uint128 beforeLiq = positionManager.getPositionLiquidity(tokenId);
        positionManager.decreaseLiquidity(
            tokenId, 1e18, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES
        );
        assertEq(positionManager.getPositionLiquidity(tokenId), beforeLiq - 1e18);
    }

    function decreaseLiquidity(uint256 id, uint256 liquidityToRemove) external {
        positionManager.decreaseLiquidity(
            id, liquidityToRemove, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES
        );
    }

    function decreaseLiquidityExpectLocked(uint256 id, uint256 liquidityToRemove) external {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.beforeRemoveLiquidity.selector,
                abi.encodeWithSelector(CollateralLockHook.PositionLocked.selector, id),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
        this.decreaseLiquidity(id, liquidityToRemove);
    }

    function _approveAndLock() internal {
        IERC721(address(positionManager)).approve(address(vault), tokenId);
        vault.lockPosition(tokenId);
    }
}
