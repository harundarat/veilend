// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {ICollateralLockHook} from "./interfaces/ICollateralLockHook.sol";

/// @title LendingVault
/// @notice Lending against Veilend demo-pool Uniswap v4 LP positions.
/// @dev `lockPosition` pulls the PositionManager NFT into the vault. `loan.borrower` stays the
///      original caller; `ownerOf` is the vault until repay returns the NFT or liquidate burns it.
///      Only the demo pool is accepted because the lock hook is part of that PoolKey.
contract LendingVault {
    IPositionManager public immutable positionManager;
    ICollateralLockHook public immutable hook;
    IERC20 public immutable loanToken;
    address public owner;
    address public relayer;
    PoolKey public demoPoolKey;
    PoolId public demoPoolId;

    uint256 public constant GRACE_PERIOD = 300;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct Loan {
        address borrower;
        uint256 positionId;
        uint256 ltvBps;
        uint256 aprBps;
        uint256 expiry;
        uint256 defaultDeadline;
        uint256 collateralValue;
        uint256 principal;
        bool active;
        bool locked;
        bool repaid;
        bool liquidated;
    }

    mapping(uint256 => Loan) public loans;

    event PositionLocked(address indexed borrower, uint256 indexed positionId, uint256 timestamp);
    event CreditReportSubmitted(
        address indexed borrower,
        uint256 indexed positionId,
        uint256 ltvBps,
        uint256 aprBps,
        uint256 expiry,
        uint256 principal
    );
    event RelayerUpdated(address indexed relayer);
    event LoanRepaid(address indexed borrower, uint256 indexed positionId, uint256 repayAmount);
    event LoanLiquidated(uint256 indexed positionId, address indexed liquidator, address indexed borrower);
    event SeizedLiquidityWithdrawn(uint256 indexed positionId, uint256 amount0, uint256 amount1);

    error NotRelayer();
    error NotOwner();
    error NotPositionOwner();
    error NotBorrower();
    error ApprovalRequired();
    error NotDemoPool();
    error InvalidHook();
    error ZeroLiquidity();
    error AlreadyLocked();
    error LoanNotLocked();
    error LoanNotActive();
    error LoanAlreadyActive();
    error AlreadyRepaid();
    error AlreadyLiquidated();
    error PastDeadline();
    error DeadlineNotPassed();
    error SeizeFailed();
    error NftTransferFailed();
    error NotSeized();
    error InvalidLtv();
    error InvalidApr();
    error InvalidExpiry();
    error InsufficientLiquidity();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(
        IPositionManager _positionManager,
        ICollateralLockHook _hook,
        IERC20 _loanToken,
        address _relayer,
        PoolKey memory _demoPoolKey
    ) {
        if (address(_demoPoolKey.hooks) != address(_hook)) revert InvalidHook();
        owner = msg.sender;
        positionManager = _positionManager;
        hook = _hook;
        loanToken = _loanToken;
        relayer = _relayer;
        demoPoolKey = _demoPoolKey;
        demoPoolId = _demoPoolKey.toId();
    }

    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
        emit RelayerUpdated(_relayer);
    }

    /// @notice Vault-side lock flag. Hook `isLocked` is the enforcement copy.
    function locked(uint256 positionId) public view returns (bool) {
        return loans[positionId].locked;
    }

    /// @notice Lock a demo-pool LP position as collateral. Pulls the NFT into the vault.
    function lockPosition(uint256 positionId) public {
        IERC721 nft = IERC721(address(positionManager));

        if (nft.ownerOf(positionId) != msg.sender) revert NotPositionOwner();
        if (nft.getApproved(positionId) != address(this) && !nft.isApprovedForAll(msg.sender, address(this))) {
            revert ApprovalRequired();
        }

        (PoolKey memory poolKey,) = positionManager.getPoolAndPositionInfo(positionId);
        if (PoolId.unwrap(poolKey.toId()) != PoolId.unwrap(demoPoolId)) revert NotDemoPool();

        if (positionManager.getPositionLiquidity(positionId) == 0) revert ZeroLiquidity();
        if (loans[positionId].locked) revert AlreadyLocked();

        try nft.transferFrom(msg.sender, address(this), positionId) {}
        catch {
            revert NftTransferFailed();
        }
        if (nft.ownerOf(positionId) != address(this)) revert NftTransferFailed();

        loans[positionId] = Loan({
            borrower: msg.sender,
            positionId: positionId,
            ltvBps: 0,
            aprBps: 0,
            expiry: 0,
            defaultDeadline: 0,
            collateralValue: 0,
            principal: 0,
            active: false,
            locked: true,
            repaid: false,
            liquidated: false
        });

        hook.registerLock(positionId);
        emit PositionLocked(msg.sender, positionId, block.timestamp);
    }

    /// @notice Extra args are ignored; borrowers cannot set valuation.
    function lockPosition(uint256 positionId, uint256, uint256) external {
        lockPosition(positionId);
    }

    /// @notice Relayer writes terms and disburses principal. Valuation is liquidity (1:1 mock-USD)
    ///         unless the relayer supplies an amount0+amount1 snapshot.
    function submitCreditReport(
        address borrower,
        uint256 positionId,
        uint256 ltvBps,
        uint256 aprBps,
        uint256 expiry
    ) external onlyRelayer {
        _submitCreditReport(borrower, positionId, ltvBps, aprBps, expiry, 0, 0);
    }

    function submitCreditReport(
        address borrower,
        uint256 positionId,
        uint256 ltvBps,
        uint256 aprBps,
        uint256 expiry,
        uint256 amount0Snapshot,
        uint256 amount1Snapshot
    ) external onlyRelayer {
        _submitCreditReport(borrower, positionId, ltvBps, aprBps, expiry, amount0Snapshot, amount1Snapshot);
    }

    function repayLoan(uint256 positionId) external {
        Loan storage loan = loans[positionId];
        if (msg.sender != loan.borrower) revert NotBorrower();
        if (loan.repaid) revert AlreadyRepaid();
        if (loan.liquidated) revert AlreadyLiquidated();
        if (!loan.active || loan.principal == 0) revert LoanNotActive();
        if (block.timestamp > loan.defaultDeadline) revert PastDeadline();

        uint256 repayAmount = loan.principal + (loan.principal * loan.aprBps / BPS_DENOMINATOR);
        if (!loanToken.transferFrom(msg.sender, address(this), repayAmount)) revert InsufficientLiquidity();

        loan.active = false;
        loan.locked = false;
        loan.repaid = true;

        hook.unlockPosition(positionId);
        emit LoanRepaid(msg.sender, positionId, repayAmount);
    }

    function liquidate(uint256 positionId) external {
        Loan storage loan = loans[positionId];
        if (!loan.active || loan.principal == 0) revert LoanNotActive();
        if (loan.repaid) revert AlreadyRepaid();
        if (loan.liquidated) revert AlreadyLiquidated();
        if (block.timestamp <= loan.defaultDeadline) revert DeadlineNotPassed();

        IERC721 nft = IERC721(address(positionManager));
        address borrower = loan.borrower;
        if (nft.ownerOf(positionId) != borrower) revert NotPositionOwner();

        try nft.transferFrom(borrower, address(this), positionId) {}
        catch {
            revert SeizeFailed();
        }

        loan.active = false;
        loan.locked = false;
        loan.liquidated = true;

        hook.unlockPosition(positionId);
        emit LoanLiquidated(positionId, msg.sender, borrower);
    }

    function withdrawSeizedLiquidity(uint256 positionId) external {
        Loan storage loan = loans[positionId];
        if (!loan.liquidated) revert NotSeized();

        IERC721 nft = IERC721(address(positionManager));
        try nft.ownerOf(positionId) returns (address nftOwner) {
            if (nftOwner != address(this)) revert NotSeized();
        } catch {
            revert NotSeized();
        }

        (PoolKey memory poolKey,) = positionManager.getPoolAndPositionInfo(positionId);
        Currency currency0 = poolKey.currency0;
        Currency currency1 = poolKey.currency1;

        uint256 balance0Before = currency0.balanceOf(address(this));
        uint256 balance1Before = currency1.balanceOf(address(this));

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(positionId, uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(currency0, currency1, address(this));

        positionManager.modifyLiquidities(
            abi.encode(abi.encodePacked(uint8(Actions.BURN_POSITION), uint8(Actions.TAKE_PAIR)), params),
            block.timestamp
        );

        uint256 amount0 = currency0.balanceOf(address(this)) - balance0Before;
        uint256 amount1 = currency1.balanceOf(address(this)) - balance1Before;
        emit SeizedLiquidityWithdrawn(positionId, amount0, amount1);
    }

    function getLoan(uint256 positionId) external view returns (Loan memory) {
        return loans[positionId];
    }

    function previewPrincipal(uint256 positionId, uint256 ltvBps)
        external
        view
        returns (uint256 collateralValue, uint256 principal)
    {
        collateralValue = _valueOf(positionId, 0, 0);
        principal = collateralValue * ltvBps / BPS_DENOMINATOR;
    }

    function _submitCreditReport(
        address borrower,
        uint256 positionId,
        uint256 ltvBps,
        uint256 aprBps,
        uint256 expiry,
        uint256 amount0Snapshot,
        uint256 amount1Snapshot
    ) internal {
        Loan storage loan = loans[positionId];
        if (!loan.locked || loan.borrower != borrower) revert LoanNotLocked();
        if (loan.active) revert LoanAlreadyActive();
        if (ltvBps == 0 || ltvBps > BPS_DENOMINATOR) revert InvalidLtv();
        if (aprBps > BPS_DENOMINATOR) revert InvalidApr();
        if (expiry <= block.timestamp) revert InvalidExpiry();

        uint256 collateralValue = _valueOf(positionId, amount0Snapshot, amount1Snapshot);
        uint256 principal = collateralValue * ltvBps / BPS_DENOMINATOR;
        if (principal == 0) revert InvalidLtv();
        if (loanToken.balanceOf(address(this)) < principal) revert InsufficientLiquidity();

        loan.ltvBps = ltvBps;
        loan.aprBps = aprBps;
        loan.expiry = expiry;
        loan.defaultDeadline = expiry + GRACE_PERIOD;
        loan.collateralValue = collateralValue;
        loan.principal = principal;
        loan.active = true;

        if (!loanToken.transfer(borrower, principal)) revert InsufficientLiquidity();

        emit CreditReportSubmitted(borrower, positionId, ltvBps, aprBps, expiry, principal);
    }

    /// @dev Priority 3: collateralValue = position liquidity (1 unit = 1 mock-USD). Snapshot args override when > 0.
    function _valueOf(uint256 positionId, uint256 amount0Snapshot, uint256 amount1Snapshot)
        internal
        view
        returns (uint256)
    {
        uint256 snapshot = amount0Snapshot + amount1Snapshot;
        if (snapshot > 0) return snapshot;
        return uint256(positionManager.getPositionLiquidity(positionId));
    }
}
