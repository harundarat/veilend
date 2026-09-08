// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {console} from "forge-std/console.sol";
import {BaseScript} from "./base/BaseScript.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";
import {LendingVault} from "../src/LendingVault.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Deploys LendingVault, wires CollateralLockHook.setVault, and prefills loan liquidity.
contract DeployVaultScript is BaseScript {
    using StateLibrary for IPoolManager;

    uint24 lpFee = 3000;
    int24 tickSpacing = 60;

    function run() public {
        // run() caller is --sender; constructor-time deployerAddress can miss the keystore.
        IERC20 loanToken = IERC20(vm.envOr("LOAN_TOKEN", address(0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e)));
        address relayer = vm.envOr("RELAYER", msg.sender);
        if (relayer == address(0)) relayer = msg.sender;
        uint256 prefund = vm.envOr("VAULT_PREFUND", uint256(1_000_000e18));
        bool replaceVault = vm.envOr("REPLACE_VAULT", false);

        CollateralLockHook hook = CollateralLockHook(address(hookContract));
        PoolKey memory poolKey = PoolKey({
            currency0: currency0, currency1: currency1, fee: lpFee, tickSpacing: tickSpacing, hooks: hookContract
        });

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolKey.toId());
        require(sqrtPriceX96 != 0, "DeployVaultScript: Pool Not Initialized");
        require(
            address(hook.poolManager()) == address(positionManager.poolManager()),
            "DeployVaultScript: PoolManager Mismatch"
        );
        require(hook.owner() == msg.sender, "DeployVaultScript: Sender Not Hook Owner");
        require(address(loanToken).code.length > 0, "DeployVaultScript: Loan Token Not Deployed");
        require(hook.vault() == address(0) || replaceVault, "DeployVaultScript: Vault Already Set");

        vm.startBroadcast();
        LendingVault vault =
            new LendingVault(IPositionManager(address(positionManager)), hook, loanToken, relayer, poolKey);
        hook.setVault(address(vault));
        if (prefund > 0) {
            MockERC20(address(loanToken)).mint(address(vault), prefund);
        }
        vm.stopBroadcast();

        console.log("LendingVault", address(vault));
        console.log("owner", vault.owner());
        console.log("relayer", vault.relayer());
        console.log("hook", address(hook));
        console.log("hookVault", hook.vault());
        console.log("loanToken", address(loanToken));
        console.log("poolId");
        console.logBytes32(PoolId.unwrap(vault.demoPoolId()));
        console.log("prefund", prefund);
    }
}
