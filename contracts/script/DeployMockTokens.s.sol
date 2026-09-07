// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// @notice Deploys the three Veilend demo MockERC20 tokens.
contract DeployMockTokens is Script {
    function run() public {
        vm.startBroadcast();
        MockERC20 vUSD = new MockERC20("Veilend USD", "vUSD");
        MockERC20 vEUR = new MockERC20("Veilend EUR", "vEUR");
        MockERC20 vdUSD = new MockERC20("Veilend Debt USD", "vdUSD");
        vm.stopBroadcast();

        console.log("vUSD", address(vUSD));
        console.log("vEUR", address(vEUR));
        console.log("vdUSD", address(vdUSD));
    }
}
