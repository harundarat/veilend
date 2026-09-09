# Veilend Contracts

Lending against Uniswap v4 LP positions. A borrower locks a demo-pool position as collateral; a Uniswap v4 hook blocks liquidity decreases while the lock is active; a vault disburses a mock stablecoin after a trusted relayer writes loan terms.

This repository is based on the official [Uniswap v4 Hook Template](https://github.com/uniswapfoundation/v4-template). The Counter `beforeSwap` / `afterSwap` example is replaced by Veilend’s `CollateralLockHook`, which still uses the template’s `BaseHook`, `HookMiner`, CREATE2 flag mining, Foundry scripts, and test harness.

## How it works

Collateral is **only** accepted from the Veilend demo pool. Uniswap v4 hooks are part of `PoolKey`, so `CollateralLockHook` cannot enforce locks on existing v4 pools.

1. Borrower holds a PositionManager NFT minted on the demo pool (hook address in the pool key).
2. Borrower `approve`s `LendingVault` on that `positionId`.
3. `LendingVault.lockPosition(positionId)` pulls the NFT into the vault (`transferFrom`) and records `loan.borrower = msg.sender`. The vault calls `CollateralLockHook.registerLock(positionId)`.
4. An off-chain relayer calls `submitCreditReport(...)`. The vault values collateral (relayer `amount0 + amount1` snapshot, otherwise position liquidity 1:1) and transfers `principal = collateralValue * ltvBps / 10000` in the loan token.
5. While locked, `beforeRemoveLiquidity` reverts `PositionLocked` when `liquidityDelta < 0`. Collect-fee (`liquidityDelta == 0`) is allowed at the hook. PositionManager sets `params.salt = bytes32(tokenId)`, so the hook keys locks as `uint256(params.salt)`.
6. `repayLoan` pulls flat interest (`principal + principal * aprBps / 10000`), unlocks the hook, and `safeTransferFrom`s the NFT back to `loan.borrower` before `defaultDeadline` (`expiry + GRACE_PERIOD`).
7. After `defaultDeadline`, anyone may `liquidate` (requires `ownerOf == vault`; no pull from the borrower) then `withdrawSeizedLiquidity` (burn the seized position).

## Contracts

| Contract | Path | Role |
|---|---|---|
| `CollateralLockHook` | [`src/CollateralLockHook.sol`](src/CollateralLockHook.sol) | v4 hook. Permissions: `beforeRemoveLiquidity` only. Owner `setVault`; vault `registerLock` / `unlockPosition`. |
| `ICollateralLockHook` | [`src/interfaces/ICollateralLockHook.sol`](src/interfaces/ICollateralLockHook.sol) | Vault-facing lock API. |
| `LendingVault` | [`src/LendingVault.sol`](src/LendingVault.sol) | Loans against demo-pool LP NFTs custodied by the vault while locked. Relayer-only credit reports. |
| `MockERC20` | [`src/mocks/MockERC20.sol`](src/mocks/MockERC20.sol) | Mintable 18-decimal ERC-20 for the demo pair (`vUSD` / `vEUR`) and loan token (`vdUSD`). |

Tests: [`test/CollateralLockHook.t.sol`](test/CollateralLockHook.t.sol), [`test/LendingVault.t.sol`](test/LendingVault.t.sol), [`test/VeilendIntegration.t.sol`](test/VeilendIntegration.t.sol).

## Deployed addresses (Ethereum Sepolia)

From Foundry `broadcast/*/11155111/run-latest.json`. Dry-runs are ignored.

| Contract | Address | Deploy script |
|---|---|---|
| MockERC20 `vUSD` (Veilend USD) | [`0x5a88a2E133251E2F92734e721b13CA6C60De6f09`](https://sepolia.etherscan.io/address/0x5a88a2E133251E2F92734e721b13CA6C60De6f09) | [`script/DeployMockTokens.s.sol`](script/DeployMockTokens.s.sol) |
| MockERC20 `vEUR` (Veilend EUR) | [`0xFbc717e1d5536699afD569860B09aC39C6f16862`](https://sepolia.etherscan.io/address/0xFbc717e1d5536699afD569860B09aC39C6f16862) | [`script/DeployMockTokens.s.sol`](script/DeployMockTokens.s.sol) |
| MockERC20 `vdUSD` (Veilend Debt USD) | [`0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e`](https://sepolia.etherscan.io/address/0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e) | [`script/DeployMockTokens.s.sol`](script/DeployMockTokens.s.sol) |
| `CollateralLockHook` | [`0xc727Bf24715514A5C574A001AaC0d7c0eC7EC200`](https://sepolia.etherscan.io/address/0xc727Bf24715514A5C574A001AaC0d7c0eC7EC200) | [`script/00_DeployHook.s.sol`](script/00_DeployHook.s.sol) (CREATE2) |
| `LendingVault` | [`0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D`](https://sepolia.etherscan.io/address/0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D) | [`script/04_DeployVault.s.sol`](script/04_DeployVault.s.sol) (`REPLACE_VAULT=true`) |

Related addresses (not deployed by this repo):

| | Address |
|---|---|
| Uniswap v4 PoolManager (Sepolia) | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| Uniswap v4 PositionManager (Sepolia) | [`0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`](https://sepolia.etherscan.io/address/0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4) |
| Hook owner / deployer | [`0xB34a4eAECB848d573a0410bc305787d5B69328B8`](https://sepolia.etherscan.io/address/0xB34a4eAECB848d573a0410bc305787d5B69328B8) |

Hook constructor arguments: PoolManager + owner. CREATE2 factory used to mine the hook address: [`0x4e59b44847b379578588920cA78FbF26c0B4956C`](https://sepolia.etherscan.io/address/0x4e59b44847b379578588920cA78FbF26c0B4956C). The mined address encodes `BEFORE_REMOVE_LIQUIDITY_FLAG`.

Deploy transactions:

- `vUSD`: [`0x8ef64bd8a284640712cf7eefb22e3f8b196ef75304b5555f7e7d89640c6c7079`](https://sepolia.etherscan.io/tx/0x8ef64bd8a284640712cf7eefb22e3f8b196ef75304b5555f7e7d89640c6c7079)
- `vEUR`: [`0x2a487ef4e0f3ec194f19d307473613aa4813c26148399eef1d8b7931cc110266`](https://sepolia.etherscan.io/tx/0x2a487ef4e0f3ec194f19d307473613aa4813c26148399eef1d8b7931cc110266)
- `vdUSD`: [`0xc9255e7eb8fd6276ff24fea394bbddb5d73a3a54e2696622580a59d3800a500d`](https://sepolia.etherscan.io/tx/0xc9255e7eb8fd6276ff24fea394bbddb5d73a3a54e2696622580a59d3800a500d)
- `CollateralLockHook`: [`0x5f8d7fbdaf45bdaf46387ef66cf3dc2ffb764c027ee9960b448fc6e6ea1088b2`](https://sepolia.etherscan.io/tx/0x5f8d7fbdaf45bdaf46387ef66cf3dc2ffb764c027ee9960b448fc6e6ea1088b2)
- `LendingVault`: [`0x9876ad424851712e3924d25f88bf04d8214825cc07738bd26b8a8beec6259472`](https://sepolia.etherscan.io/tx/0x9876ad424851712e3924d25f88bf04d8214825cc07738bd26b8a8beec6259472) (`setVault`: [`0xa09ea18fff6de061e517553ce9021cfcd09eb1997d2abfdd6a02c3455288d0ef`](https://sepolia.etherscan.io/tx/0xa09ea18fff6de061e517553ce9021cfcd09eb1997d2abfdd6a02c3455288d0ef); `vdUSD` prefund: [`0xe1b0739f1c99a2b8e89fe14e2acad56fed7d58974b8c1ac110fe7b8185ef5cbf`](https://sepolia.etherscan.io/tx/0xe1b0739f1c99a2b8e89fe14e2acad56fed7d58974b8c1ac110fe7b8185ef5cbf))

### Demo pool (vUSD / vEUR)

| | |
|---|---|
| PoolId | `0x8ca493510350e7ae46e05d9d04db161f2d3f0df33ee9f3fdfaf1601477c82042` |
| Position NFT `tokenId` | `39014` |

[`script/01_CreatePoolAndAddLiquidity.s.sol`](script/01_CreatePoolAndAddLiquidity.s.sol): [`0x9819ef90d15d3f7ee863a5cd8990614f89dc7280ecda36f635b3d4d96ca91e8a`](https://sepolia.etherscan.io/tx/0x9819ef90d15d3f7ee863a5cd8990614f89dc7280ecda36f635b3d4d96ca91e8a)

## Requirements

Foundry **stable**. Nightly can break compatibility:

```
foundryup
```

`foundry.toml` uses solc `0.8.30` and EVM Cancun.

```
forge install
forge test
```

## Local development

Hooks are deployed and exercised locally on [Anvil](https://book.getfoundry.sh/anvil/). Scripts in `script/` also work against a live RPC.

### Anvil

```bash
anvil
# or
anvil --fork-url <YOUR_RPC_URL>
```

```bash
forge script script/DeployMockTokens.s.sol \
    --rpc-url http://localhost:8545 \
    --private-key <PRIVATE_KEY> \
    --broadcast

forge script script/00_DeployHook.s.sol \
    --rpc-url http://localhost:8545 \
    --private-key <PRIVATE_KEY> \
    --broadcast

forge script script/01_CreatePoolAndAddLiquidity.s.sol \
    --rpc-url http://localhost:8545 \
    --private-key <PRIVATE_KEY> \
    --broadcast

# TOKEN0, TOKEN1, HOOK_CONTRACT, and LOAN_TOKEN must be the local Anvil addresses
# (script defaults are Sepolia). Then:
forge script script/04_DeployVault.s.sol \
    --rpc-url http://localhost:8545 \
    --private-key <PRIVATE_KEY> \
    --broadcast
```

Local Uniswap v4 artifacts (Anvil only): `script/testing/00_DeployV4.s.sol`. Those deployments are **not** picked up automatically unless `test/utils/Deployers.sol` is updated.

### Live RPC (keystore)

Do not put a private key in `.env` or on the command line. Use `--account` with a Foundry keystore.

<details>
<summary>Import a key into the keystore (once)</summary>

```bash
cast wallet import <SET_A_NAME_FOR_KEY> --interactive
```

```
Enter private key: <YOUR_PRIVATE_KEY>
Enter keystore password: <SET_NEW_PASSWORD>
```

Use `history -c` afterwards to clear shell history.

</details>

```bash
forge script script/00_DeployHook.s.sol \
    --rpc-url <YOUR_RPC_URL> \
    --account <YOUR_WALLET_PRIVATE_KEY_NAME> \
    --sender <YOUR_WALLET_ADDRESS> \
    --broadcast

forge script script/04_DeployVault.s.sol \
    --rpc-url <YOUR_RPC_URL> \
    --account <YOUR_WALLET_PRIVATE_KEY_NAME> \
    --sender <YOUR_WALLET_ADDRESS> \
    --broadcast
```

### Script configuration

Before `01_CreatePoolAndAddLiquidity`, `02_AddLiquidity`, `03_Swap`, or `04_DeployVault`, set addresses in `.env` (see [`.env.example`](.env.example)):

```
TOKEN0=<vUSD or other token0>
TOKEN1=<vEUR or other token1>
HOOK_CONTRACT=<CollateralLockHook>
LOAN_TOKEN=<vdUSD>
RELAYER=<credit-report signer; omit to use the deployer>
VAULT_PREFUND=<vdUSD minted to the vault; 0 skips mint>
REPLACE_VAULT=<true to overwrite an existing hook.vault(); default false>
```

Foundry loads `.env` automatically. If a variable is unset, [`script/base/BaseScript.sol`](script/base/BaseScript.sol) falls back to the Sepolia `vUSD` / `vEUR` / `CollateralLockHook` addresses above, and [`script/04_DeployVault.s.sol`](script/04_DeployVault.s.sol) falls back to Sepolia `vdUSD`, the broadcast sender as relayer, and a `1_000_000e18` prefund. The hook address must match an already-initialized pool. The broadcast sender must be the hook owner (`setVault`). A second run reverts unless `REPLACE_VAULT=true`.

Also set amounts in:

- [`script/01_CreatePoolAndAddLiquidity.s.sol`](script/01_CreatePoolAndAddLiquidity.s.sol) — `token0Amount`, `token1Amount`
- [`script/02_AddLiquidity.s.sol`](script/02_AddLiquidity.s.sol) — `token0Amount`, `token1Amount`
- [`script/03_Swap.s.sol`](script/03_Swap.s.sol) — `amountIn`, `amountOutMin`

### Verifying the hook

```bash
forge verify-contract \
  --rpc-url <URL> \
  --chain sepolia \
  --verifier etherscan \
  --etherscan-api-key <ETHERSCAN_API_KEY> \
  --constructor-args <ABI_ENCODED_ARGS> \
  --num-of-optimizations <OPTIMIZER_RUNS> \
  <Contract_Address> \
  src/CollateralLockHook.sol:CollateralLockHook \
  --watch
```

Constructor args for the Sepolia hook: PoolManager + owner, ABI-encoded.
