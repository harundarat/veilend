# Lock → disburse evidence (Anvil fork of Sepolia)

Captured 2026-09-09 against the current Sepolia vault (`0x359E…b65D`), forked locally. No extra testnet broadcast. `lockPosition` pulled NFT `39014` into the vault (custody).

## Chain / contracts

| | |
|---|---|
| RPC | `anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8545 --chain-id 11155111` |
| Vault | `0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D` |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| vdUSD | `0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e` |
| Borrower / NFT owner | `0xB34a4eAECB848d573a0410bc305787d5B69328B8` |
| Relayer on fork | Anvil account 0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (after `setRelayer`) |
| `positionId` | `39014` |

Vault already held `1_000_000e18` vdUSD. Position `39014` was unlocked on Sepolia and owned by the borrower.

## Commands

```bash
anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8545 --chain-id 11155111

cast rpc anvil_impersonateAccount 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --rpc-url http://127.0.0.1:8545
cast rpc anvil_setBalance 0xB34a4eAECB848d573a0410bc305787d5B69328B8 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8545
cast send 0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D "setRelayer(address)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545
cast send 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4 "approve(address,uint256)" \
  0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D 39014 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545
cast send 0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D "lockPosition(uint256)" 39014 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545

bun install --cwd relayer
bun run --cwd relayer src/index.ts --once --from-block 11668149
```

`--terms-file` was not used. Relayer spawned `cre workflow simulate credit-scoring-workflow` from `cre-workflow/`. After lock, `ownerOf(39014)` was the vault.

## Hashes

| Step | Tx / block |
|---|---|
| `setRelayer` | `0x62ae7656828d44bbb25e56d6da4f0281f18f096bba299caca74d4ccb5291f0e5` (block `11668147`) |
| `approve` | `0x8cb07349fb6a6f77496c4bcb62946642e1d043651297507ea4b9069ef49a348f` (block `11668148`) |
| `lockPosition` | `0x502dcdb4e41ce84ec990926136b0c04bdb6a82a9f46fdf973451194d1548a655` (block `11668149`) |
| `submitCreditReport` | `0xdc1d91b81839c434be054d8a462a1de916b494ad8d4ab155ebd0c36d1cf5eb5d` (block `11668150`) |

## CRE simulate (from `relayer.log`)

```
2026-09-09T20:12:04Z [USER LOG] terms computed ltvBps=5500 aprBps=800 expiry=1788963123 dataSource=onchain

✓ Workflow Simulation Result:
{
  "aprBps": 800,
  "expiry": 1788963123,
  "ltvBps": 5500
}
```

## On-chain after report

| Field | Value |
|---|---|
| NFT `ownerOf(39014)` | vault `0x359E7aCd51042ede88A4c01c4ADeE49d2481b65D` |
| `hook.isLocked(39014)` | `true` |
| `ltvBps` | `5500` |
| `aprBps` | `800` |
| `expiry` | `1788963123` |
| `defaultDeadline` | `1788963423` (`expiry + GRACE_PERIOD 300`) |
| `collateralValue` | `111783186636072771050` (position liquidity, 1:1 mock-USD) |
| `principal` | `61480752649840024077` (`collateralValue * 5500 / 10000`) |
| borrower vdUSD | `0` → `61480752649840024077` |
| vault vdUSD | `1000000000000000000000000` → `999938519247350159975923` |
| `loan.active` | `true` |
| `loan.locked` | `true` |
| `loan.repaid` / `loan.liquidated` | `false` / `false` |

Raw relayer stdout: [`relayer.log`](relayer.log).
