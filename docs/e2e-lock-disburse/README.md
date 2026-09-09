# Lock → disburse evidence (Anvil fork of Sepolia)

Captured 2026-09-09 against the Hari 1 Sepolia vault, forked locally. No testnet broadcast.

## Chain / contracts

| | |
|---|---|
| RPC | `anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8545 --chain-id 11155111` |
| Vault | `0xFf1E171F9A4484D6cb034d68557d30C03934BFc9` |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| vdUSD | `0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e` |
| Borrower / NFT owner | `0xB34a4eAECB848d573a0410bc305787d5B69328B8` |
| Relayer on fork | Anvil account 0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (after `setRelayer`) |
| `positionId` | `39014` |

Vault already held `1_000_000e18` vdUSD. Position `39014` was unlocked on Sepolia.

## Commands

```bash
anvil --fork-url https://ethereum-sepolia-rpc.publicnode.com --port 8545 --chain-id 11155111

cast rpc anvil_impersonateAccount 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --rpc-url http://127.0.0.1:8545
cast rpc anvil_setBalance 0xB34a4eAECB848d573a0410bc305787d5B69328B8 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8545
cast send 0xFf1E171F9A4484D6cb034d68557d30C03934BFc9 "setRelayer(address)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545
cast send 0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4 "approve(address,uint256)" \
  0xFf1E171F9A4484D6cb034d68557d30C03934BFc9 39014 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545
cast send 0xFf1E171F9A4484D6cb034d68557d30C03934BFc9 "lockPosition(uint256)" 39014 \
  --from 0xB34a4eAECB848d573a0410bc305787d5B69328B8 --unlocked --rpc-url http://127.0.0.1:8545

bun install --cwd relayer
bun run --cwd relayer src/index.ts --once --from-block 11665623
```

`--terms-file` was not used. Relayer spawned `cre workflow simulate credit-scoring-workflow` from `cre-workflow/`.

## Hashes

| Step | Tx / block |
|---|---|
| `setRelayer` | `0x2fed8ef7441d4fad853d6f0964df77f958d5eef7d0d744ac5030185993ceacc2` |
| `approve` | `0x5e2d23bc84ba9a5407987223d6d299d70efbe7e719b991bb6345ab9471b0fc11` |
| `lockPosition` | `0x66170d881f220a7fe2c816ebf10c4b55b8015e6fcec85277204284841fc8f951` (block `11665623`) |
| `submitCreditReport` | `0x10de9474c6424bfbeb58eb849d096f90ea2949445a943bd3ed46e192ad7e25ef` (block `11665624`) |

## CRE simulate (from `relayer.log`)

```
2026-09-09T11:29:02Z [USER LOG] terms computed ltvBps=5500 aprBps=800 expiry=1788931741 dataSource=onchain

✓ Workflow Simulation Result:
{
  "aprBps": 800,
  "expiry": 1788931741,
  "ltvBps": 5500
}
```

## On-chain after report

| Field | Value |
|---|---|
| `ltvBps` | `5500` |
| `aprBps` | `800` |
| `expiry` | `1788931741` |
| `defaultDeadline` | `1788932041` (`expiry + GRACE_PERIOD 300`) |
| `collateralValue` | `111783186636072771050` (position liquidity, 1:1 mock-USD) |
| `principal` | `61480752649840024077` (`collateralValue * 5500 / 10000`) |
| borrower vdUSD | `0` → `61480752649840024077` |
| vault vdUSD | `1000000000000000000000000` → `999938519247350159975923` |
| `loan.active` | `true` |

Raw relayer stdout: [`relayer.log`](relayer.log).
