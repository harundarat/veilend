// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {CollateralLockHook} from "../src/CollateralLockHook.sol";

/// @notice Mines the address and deploys the CollateralLockHook contract
contract DeployHookScript is BaseScript {
    function run() public {
        // hook contracts must have specific flags encoded in the address
        uint160 flags = uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG);

        // Mine a salt that will produce a hook address with the correct flags.
        // Owner is passed explicitly: CREATE2 is executed by the factory, so msg.sender
        // in the constructor would otherwise be CREATE2_FACTORY, not the broadcasting EOA.
        bytes memory constructorArgs = abi.encode(poolManager, deployerAddress);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(CollateralLockHook).creationCode, constructorArgs);

        // Deploy the hook using CREATE2
        vm.startBroadcast();
        CollateralLockHook hook = new CollateralLockHook{salt: salt}(poolManager, deployerAddress);
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookScript: Hook Address Mismatch");
    }
}
