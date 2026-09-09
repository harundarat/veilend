// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";
import {LendingVault} from "../src/LendingVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract MockPositionManager {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => uint128) public getPositionLiquidity;
    mapping(uint256 => PoolKey) internal _poolKeys;

    function approve(address spender, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        getApproved[tokenId] = spender;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        require(
            msg.sender == from || getApproved[tokenId] == msg.sender || isApprovedForAll[from][msg.sender],
            "not approved"
        );
        ownerOf[tokenId] = to;
        getApproved[tokenId] = address(0);
    }

    function setPosition(uint256 tokenId, address owner, PoolKey memory key, uint128 liquidity) external {
        ownerOf[tokenId] = owner;
        _poolKeys[tokenId] = key;
        getPositionLiquidity[tokenId] = liquidity;
        getApproved[tokenId] = address(0);
    }

    function getPoolAndPositionInfo(uint256 tokenId) external view returns (PoolKey memory, bytes32) {
        return (_poolKeys[tokenId], bytes32(0));
    }
}

contract LendingVaultTest is Test {
    uint256 internal constant POSITION_ID = 1;
    uint128 internal constant LIQUIDITY = 100e18;
    uint256 internal constant VAULT_PREFUND = 1_000e18;

    MockERC20 internal mockA;
    MockERC20 internal mockB;
    MockERC20 internal mockStable;

    MockPositionManager internal positionManager;
    CollateralLockHook internal hook;
    LendingVault internal vault;

    PoolKey internal demoPoolKey;

    address internal borrower;
    address internal relayer;
    address internal attacker;

    function setUp() public {
        borrower = makeAddr("borrower");
        relayer = makeAddr("relayer");
        attacker = makeAddr("attacker");

        mockA = new MockERC20("Mock A", "MA");
        mockB = new MockERC20("Mock B", "MB");
        mockStable = new MockERC20("Mock Stable", "mUSD");

        address flags = address(uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG) ^ (0x5555 << 144));
        bytes memory constructorArgs = abi.encode(IPoolManager(address(1)), address(this));
        deployCodeTo("CollateralLockHook.sol:CollateralLockHook", constructorArgs, flags);
        hook = CollateralLockHook(flags);

        Currency currency0 = Currency.wrap(address(mockA));
        Currency currency1 = Currency.wrap(address(mockB));
        if (currency0 > currency1) (currency0, currency1) = (currency1, currency0);
        demoPoolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));

        positionManager = new MockPositionManager();
        vault = new LendingVault(
            IPositionManager(address(positionManager)), hook, mockStable, relayer, demoPoolKey
        );
        hook.setVault(address(vault));

        mockStable.mint(address(vault), VAULT_PREFUND);
        positionManager.setPosition(POSITION_ID, borrower, demoPoolKey, LIQUIDITY);
    }

    function _approveAndLock() internal {
        vm.prank(borrower);
        positionManager.approve(address(vault), POSITION_ID);
        vm.prank(borrower);
        vault.lockPosition(POSITION_ID);
    }

    function _lockAndReport() internal returns (uint256 principal, uint256 expiry, uint256 aprBps) {
        _approveAndLock();
        uint256 ltvBps = 5000;
        aprBps = 1000;
        expiry = block.timestamp + 1 days;
        principal = uint256(LIQUIDITY) * ltvBps / 10_000;
        vm.prank(relayer);
        vault.submitCreditReport(borrower, POSITION_ID, ltvBps, aprBps, expiry);
    }

    function _repayAmount(uint256 principal, uint256 aprBps) internal pure returns (uint256) {
        return principal + (principal * aprBps / 10_000);
    }

    function _fundAndApproveRepay(uint256 repayAmount) internal {
        uint256 have = mockStable.balanceOf(borrower);
        if (have < repayAmount) {
            mockStable.mint(borrower, repayAmount - have);
        }
        vm.prank(borrower);
        mockStable.approve(address(vault), repayAmount);
    }

    function test_lockPosition_succeeds() public {
        vm.prank(borrower);
        positionManager.approve(address(vault), POSITION_ID);

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.PositionLocked(borrower, POSITION_ID, block.timestamp);

        vm.prank(borrower);
        vault.lockPosition(POSITION_ID);

        assertEq(positionManager.ownerOf(POSITION_ID), borrower);
        assertTrue(hook.isLocked(POSITION_ID));
        assertTrue(vault.locked(POSITION_ID));

        LendingVault.Loan memory loan = vault.getLoan(POSITION_ID);
        assertEq(loan.borrower, borrower);
        assertEq(loan.positionId, POSITION_ID);
        assertTrue(loan.locked);
        assertFalse(loan.active);
        assertEq(loan.principal, 0);
    }

    function test_lockPosition_revertsWithoutApproval() public {
        vm.prank(borrower);
        vm.expectRevert(LendingVault.ApprovalRequired.selector);
        vault.lockPosition(POSITION_ID);
    }

    function test_lockPosition_revertsIfNotOwner() public {
        vm.prank(borrower);
        positionManager.approve(address(vault), POSITION_ID);

        vm.prank(attacker);
        vm.expectRevert(LendingVault.NotPositionOwner.selector);
        vault.lockPosition(POSITION_ID);
    }

    function test_lockPosition_revertsIfNotDemoPool() public {
        PoolKey memory other = demoPoolKey;
        other.fee = 500;
        uint256 otherId = 2;
        positionManager.setPosition(otherId, borrower, other, LIQUIDITY);

        vm.prank(borrower);
        positionManager.approve(address(vault), otherId);

        vm.prank(borrower);
        vm.expectRevert(LendingVault.NotDemoPool.selector);
        vault.lockPosition(otherId);
    }

    function test_lockPosition_revertsIfZeroLiquidity() public {
        uint256 emptyId = 3;
        positionManager.setPosition(emptyId, borrower, demoPoolKey, 0);

        vm.prank(borrower);
        positionManager.approve(address(vault), emptyId);

        vm.prank(borrower);
        vm.expectRevert(LendingVault.ZeroLiquidity.selector);
        vault.lockPosition(emptyId);
    }

    function test_lockPosition_revertsIfAlreadyLocked() public {
        _approveAndLock();

        vm.prank(borrower);
        vm.expectRevert(LendingVault.AlreadyLocked.selector);
        vault.lockPosition(POSITION_ID);
    }

    function test_submitCreditReport_revertsForNonRelayer() public {
        _approveAndLock();

        vm.prank(attacker);
        vm.expectRevert(LendingVault.NotRelayer.selector);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 1000, block.timestamp + 1 days);
    }

    function test_submitCreditReport_transfersPrincipalFromLiquidity() public {
        _approveAndLock();

        uint256 ltvBps = 5000;
        uint256 expectedPrincipal = uint256(LIQUIDITY) * ltvBps / 10_000;
        uint256 vaultBefore = mockStable.balanceOf(address(vault));
        uint256 borrowerBefore = mockStable.balanceOf(borrower);
        uint256 expiry = block.timestamp + 1 days;

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.CreditReportSubmitted(borrower, POSITION_ID, ltvBps, 1000, expiry, expectedPrincipal);

        vm.prank(relayer);
        vault.submitCreditReport(borrower, POSITION_ID, ltvBps, 1000, expiry);

        assertEq(mockStable.balanceOf(borrower), borrowerBefore + expectedPrincipal);
        assertEq(mockStable.balanceOf(address(vault)), vaultBefore - expectedPrincipal);

        LendingVault.Loan memory loan = vault.getLoan(POSITION_ID);
        assertTrue(loan.active);
        assertEq(loan.principal, expectedPrincipal);
        assertEq(loan.collateralValue, uint256(LIQUIDITY));
        assertEq(loan.ltvBps, ltvBps);
        assertEq(loan.aprBps, 1000);
        assertEq(loan.expiry, expiry);
        assertEq(loan.defaultDeadline, expiry + vault.GRACE_PERIOD());
    }

    function test_submitCreditReport_revertsIfAlreadyActive() public {
        _approveAndLock();

        vm.prank(relayer);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 1000, block.timestamp + 1 days);

        vm.prank(relayer);
        vm.expectRevert(LendingVault.LoanAlreadyActive.selector);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 1000, block.timestamp + 2 days);
    }

    function test_submitCreditReport_revertsIfExpiryNotFuture() public {
        _approveAndLock();

        vm.prank(relayer);
        vm.expectRevert(LendingVault.InvalidExpiry.selector);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 1000, block.timestamp);
    }

    function test_submitCreditReport_revertsIfAprTooHigh() public {
        _approveAndLock();

        vm.prank(relayer);
        vm.expectRevert(LendingVault.InvalidApr.selector);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 10_001, block.timestamp + 1 days);
    }

    function test_submitCreditReport_revertsIfNotLocked() public {
        vm.prank(relayer);
        vm.expectRevert(LendingVault.LoanNotLocked.selector);
        vault.submitCreditReport(borrower, POSITION_ID, 5000, 1000, block.timestamp + 1 days);
    }

    function test_constructor_revertsIfHookMismatch() public {
        PoolKey memory mismatched = demoPoolKey;
        mismatched.hooks = IHooks(address(0xBEEF));
        vm.expectRevert(LendingVault.InvalidHook.selector);
        new LendingVault(IPositionManager(address(positionManager)), hook, mockStable, relayer, mismatched);
    }

    function test_submitCreditReport_transfersPrincipalFromRelayerSnapshot() public {
        _approveAndLock();

        uint256 amount0 = 100e18;
        uint256 amount1 = 100e18;
        uint256 ltvBps = 5000;
        uint256 expectedPrincipal = (amount0 + amount1) * ltvBps / 10_000;
        uint256 vaultBefore = mockStable.balanceOf(address(vault));
        uint256 borrowerBefore = mockStable.balanceOf(borrower);
        uint256 expiry = block.timestamp + 1 days;

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.CreditReportSubmitted(borrower, POSITION_ID, ltvBps, 1000, expiry, expectedPrincipal);

        vm.prank(relayer);
        vault.submitCreditReport(borrower, POSITION_ID, ltvBps, 1000, expiry, amount0, amount1);

        assertEq(mockStable.balanceOf(borrower), borrowerBefore + expectedPrincipal);
        assertEq(mockStable.balanceOf(address(vault)), vaultBefore - expectedPrincipal);

        LendingVault.Loan memory loan = vault.getLoan(POSITION_ID);
        assertTrue(loan.active);
        assertEq(loan.principal, expectedPrincipal);
        assertEq(loan.collateralValue, amount0 + amount1);
        assertEq(loan.ltvBps, ltvBps);
        assertEq(loan.aprBps, 1000);
        assertEq(loan.expiry, expiry);
        assertEq(loan.defaultDeadline, expiry + vault.GRACE_PERIOD());
    }

    function test_submitCreditReport_ignoresBorrowerLockSnapshot() public {
        vm.prank(borrower);
        positionManager.approve(address(vault), POSITION_ID);
        vm.prank(borrower);
        vault.lockPosition(POSITION_ID, 1_000e18, 1_000e18);

        uint256 ltvBps = 5000;
        uint256 expectedPrincipal = uint256(LIQUIDITY) * ltvBps / 10_000;
        uint256 vaultBefore = mockStable.balanceOf(address(vault));

        vm.prank(relayer);
        vault.submitCreditReport(borrower, POSITION_ID, ltvBps, 1000, block.timestamp + 1 days);

        assertEq(mockStable.balanceOf(borrower), expectedPrincipal);
        assertEq(mockStable.balanceOf(address(vault)), vaultBefore - expectedPrincipal);
        assertEq(vault.getLoan(POSITION_ID).collateralValue, uint256(LIQUIDITY));
    }

    function test_repayLoan_pullsFlatInterestAndUnlocks() public {
        (uint256 principal, , uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        _fundAndApproveRepay(repayAmount);

        uint256 vaultBefore = mockStable.balanceOf(address(vault));

        vm.expectEmit(true, true, false, true, address(vault));
        emit LendingVault.LoanRepaid(borrower, POSITION_ID, repayAmount);

        vm.prank(borrower);
        vault.repayLoan(POSITION_ID);

        assertEq(mockStable.balanceOf(address(vault)), vaultBefore + repayAmount);
        assertFalse(vault.locked(POSITION_ID));
        assertFalse(hook.isLocked(POSITION_ID));

        LendingVault.Loan memory loan = vault.getLoan(POSITION_ID);
        assertFalse(loan.active);
        assertFalse(loan.locked);
        assertTrue(loan.repaid);
        assertFalse(loan.liquidated);
        assertEq(loan.principal, principal);
    }

    function test_repayLoan_revertsWithoutStableApproval() public {
        (uint256 principal, , uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        uint256 have = mockStable.balanceOf(borrower);
        if (have < repayAmount) {
            mockStable.mint(borrower, repayAmount - have);
        }

        vm.prank(borrower);
        vm.expectRevert();
        vault.repayLoan(POSITION_ID);
    }

    function test_repayLoan_revertsIfAlreadyRepaid() public {
        (uint256 principal, , uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        _fundAndApproveRepay(repayAmount);

        vm.prank(borrower);
        vault.repayLoan(POSITION_ID);

        _fundAndApproveRepay(repayAmount);
        vm.prank(borrower);
        vm.expectRevert(LendingVault.AlreadyRepaid.selector);
        vault.repayLoan(POSITION_ID);
    }

    function test_repayLoan_revertsBeforeReport() public {
        _approveAndLock();
        vm.prank(borrower);
        vm.expectRevert(LendingVault.LoanNotActive.selector);
        vault.repayLoan(POSITION_ID);
    }

    function test_repayLoan_revertsForNonBorrower() public {
        (uint256 principal, , uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        _fundAndApproveRepay(repayAmount);

        vm.prank(attacker);
        vm.expectRevert(LendingVault.NotBorrower.selector);
        vault.repayLoan(POSITION_ID);
    }

    function test_repayLoan_succeedsOnDefaultDeadline() public {
        (uint256 principal, uint256 expiry, uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        _fundAndApproveRepay(repayAmount);

        vm.warp(expiry + vault.GRACE_PERIOD());
        vm.prank(borrower);
        vault.repayLoan(POSITION_ID);

        assertTrue(vault.getLoan(POSITION_ID).repaid);
    }

    function test_repayLoan_revertsAfterDefaultDeadline() public {
        (uint256 principal, uint256 expiry, uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);
        _fundAndApproveRepay(repayAmount);

        vm.warp(expiry + vault.GRACE_PERIOD() + 1);
        vm.prank(borrower);
        vm.expectRevert(LendingVault.PastDeadline.selector);
        vault.repayLoan(POSITION_ID);
    }

    function test_repayLoan_revertsAfterLiquidate() public {
        (uint256 principal, uint256 expiry, uint256 aprBps) = _lockAndReport();
        uint256 repayAmount = _repayAmount(principal, aprBps);

        vm.warp(expiry + vault.GRACE_PERIOD() + 1);
        vm.prank(attacker);
        vault.liquidate(POSITION_ID);

        _fundAndApproveRepay(repayAmount);
        vm.prank(borrower);
        vm.expectRevert(LendingVault.AlreadyLiquidated.selector);
        vault.repayLoan(POSITION_ID);
    }

    function test_liquidate_afterDeadline_seizesNft() public {
        (, uint256 expiry,) = _lockAndReport();

        vm.warp(expiry + vault.GRACE_PERIOD() + 1);

        vm.expectEmit(true, true, true, true, address(vault));
        emit LendingVault.LoanLiquidated(POSITION_ID, attacker, borrower);

        vm.prank(attacker);
        vault.liquidate(POSITION_ID);

        assertEq(positionManager.ownerOf(POSITION_ID), address(vault));
        assertFalse(hook.isLocked(POSITION_ID));
        assertFalse(vault.locked(POSITION_ID));

        LendingVault.Loan memory loan = vault.getLoan(POSITION_ID);
        assertTrue(loan.liquidated);
        assertFalse(loan.active);
        assertFalse(loan.repaid);
        assertFalse(loan.locked);
    }

    function test_liquidate_beforeDeadline_reverts() public {
        _lockAndReport();

        vm.prank(attacker);
        vm.expectRevert(LendingVault.DeadlineNotPassed.selector);
        vault.liquidate(POSITION_ID);
    }

    function test_liquidate_onDefaultDeadline_reverts() public {
        (, uint256 expiry,) = _lockAndReport();
        vm.warp(expiry + vault.GRACE_PERIOD());

        vm.prank(attacker);
        vm.expectRevert(LendingVault.DeadlineNotPassed.selector);
        vault.liquidate(POSITION_ID);
    }

    function test_liquidate_withoutNftApproval_reverts() public {
        (, uint256 expiry,) = _lockAndReport();

        vm.prank(borrower);
        positionManager.approve(address(0), POSITION_ID);

        vm.warp(expiry + vault.GRACE_PERIOD() + 1);
        vm.prank(attacker);
        vm.expectRevert(LendingVault.SeizeFailed.selector);
        vault.liquidate(POSITION_ID);

        assertEq(positionManager.ownerOf(POSITION_ID), borrower);
        assertFalse(vault.getLoan(POSITION_ID).liquidated);
    }

    function test_liquidate_revertsIfNotActive() public {
        vm.prank(attacker);
        vm.expectRevert(LendingVault.LoanNotActive.selector);
        vault.liquidate(POSITION_ID);
    }

    function test_withdrawSeizedLiquidity_revertsIfNotLiquidated() public {
        _lockAndReport();
        vm.expectRevert(LendingVault.NotSeized.selector);
        vault.withdrawSeizedLiquidity(POSITION_ID);
    }
}
