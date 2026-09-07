// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {console} from "forge-std/console.sol";
import {BaseScript} from "./base/BaseScript.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";

/// @notice Mines the address and deploys the CollateralLockHook contract
contract DeployHookScript is BaseScript {
    function run() public {
        // hook contracts must have specific flags encoded in the address
        uint160 flags = uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG);

        // run() caller is --sender; constructor-time deployerAddress can miss the keystore.
        address owner_ = msg.sender;

        // CREATE2 is executed by the factory, so the hook constructor's msg.sender would be CREATE2_FACTORY.
        bytes memory constructorArgs = abi.encode(poolManager, owner_);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(CollateralLockHook).creationCode, constructorArgs);

        // Deploy the hook using CREATE2
        vm.startBroadcast();
        CollateralLockHook hook = new CollateralLockHook{salt: salt}(poolManager, owner_);
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookScript: Hook Address Mismatch");
        require(hook.owner() == owner_, "DeployHookScript: Owner Mismatch");

        console.log("CollateralLockHook", address(hook));
        console.log("owner", hook.owner());
        console.log("poolManager", address(hook.poolManager()));
    }
}
