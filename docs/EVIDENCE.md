# Evidence index

Paths already in the repo. Not a CRE or Uniswap tutorial.

## CRE simulate (3 wallets)

`cre workflow simulate credit-scoring-workflow --target staging-settings --non-interactive --trigger-index 0 --http-payload <file>` from `cre-workflow/`. Output is only `{ ltvBps, aprBps, expiry }`. TokenIds `1000001–1000003` are not on-chain, so `handlerInTee` used `config.demoPositions` (`dataSource=config`).

| File | What it is |
|---|---|
| [`docs/cre-simulation/README.md`](cre-simulation/README.md) | One-paragraph capture notes + the exact CLI command |
| [`docs/cre-simulation/payload-wallet-a.json`](cre-simulation/payload-wallet-a.json) | HTTP body: excellent demo wallet, `positionId` 1000001 |
| [`docs/cre-simulation/payload-wallet-b.json`](cre-simulation/payload-wallet-b.json) | Average demo wallet, `positionId` 1000002 |
| [`docs/cre-simulation/payload-wallet-c.json`](cre-simulation/payload-wallet-c.json) | Risky demo wallet, `positionId` 1000003 |
| [`docs/cre-simulation/wallet-a.log`](cre-simulation/wallet-a.log) | CLI log: `ltvBps=7000 aprBps=500`, TEE banner, JSON result |
| [`docs/cre-simulation/wallet-b.log`](cre-simulation/wallet-b.log) | CLI log: `ltvBps=5500 aprBps=800` |
| [`docs/cre-simulation/wallet-c.log`](cre-simulation/wallet-c.log) | CLI log: `ltvBps=2000 aprBps=1800` |

## Lock → disburse (Anvil fork of Sepolia)

No extra Sepolia broadcast. Vault `0xFf1E171F9A4484D6cb034d68557d30C03934BFc9`, NFT `39014`. Relayer spawned `cre workflow simulate`; terms `ltvBps=5500 aprBps=800 dataSource=onchain`; `vdUSD` left the vault.

| File | What it is |
|---|---|
| [`docs/e2e-lock-disburse/README.md`](e2e-lock-disburse/README.md) | Commands, tx hashes on the fork, loan fields after report |
| [`docs/e2e-lock-disburse/relayer.log`](e2e-lock-disburse/relayer.log) | Raw relayer stdout including the simulate JSON |

There is **no** captured fork log for `repayLoan` or `liquidate`. Those paths are covered by Foundry tests below.

## Foundry (repay + liquidate)

`cd contracts && forge test --match-contract 'LendingVaultTest|VeilendIntegrationTest|CollateralLockHookTest'` — **48 passed, 0 failed** (2026-09-09).

| File | Relevant tests |
|---|---|
| [`contracts/test/CollateralLockHook.t.sol`](../contracts/test/CollateralLockHook.t.sol) | `test_lockedDecrease_reverts`, `test_lockedCollectFee_ok` |
| [`contracts/test/LendingVault.t.sol`](../contracts/test/LendingVault.t.sol) | `test_repayLoan_pullsFlatInterestAndUnlocks`, `test_repayLoan_revertsAfterDefaultDeadline`, `test_liquidate_afterDeadline_seizesNft`, `test_liquidate_withoutNftApproval_reverts` |
| [`contracts/test/VeilendIntegration.t.sol`](../contracts/test/VeilendIntegration.t.sol) | `test_repayLoan_unlocksAndAllowsDecrease`, `test_liquidate_thenWithdrawSeizedLiquidity`, `test_lockThenDecrease_reverts`, `test_lockThenCollect_succeeds` |
