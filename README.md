# Veilend

Lending against a Uniswap v4 LP position on a **demo pool**, with a **personal LTV / APR** computed inside a Chainlink CRE Confidential Workflow (TEE). Raw credit inputs never leave the enclave; the chain only sees `(ltvBps, aprBps, expiry)`.

## Tracks

ETHOnline 2026 partner tracks claimed:

- **Uniswap Foundation — Best Uniswap Stack Contribution**
- **Chainlink — Best Confidential Workflow**

Not entering the Automated Liquidation Protection Challenge or the Continuity Track.

## How it works

1. Borrower holds a PositionManager NFT minted on the Veilend demo pool (the hook is part of that pool’s `PoolKey`).
2. Borrower `approve`s `LendingVault` on that `positionId`.
3. `lockPosition` uses that approval **now**: `transferFrom` the NFT into the vault. `loan.borrower` stays the caller. The vault calls `CollateralLockHook.registerLock`.
4. A trusted Bun relayer watches `PositionLocked`, runs `cre workflow simulate` (HTTP trigger, `handlerInTee`), and parses stdout for terms.
5. Relayer calls `submitCreditReport` (`onlyRelayer`). The vault values collateral on-chain and transfers `principal = collateralValue * ltvBps / 10000` in `vdUSD`.
6. `defaultDeadline = expiry + GRACE_PERIOD` (`GRACE_PERIOD = 300` seconds).
7. While locked, `beforeRemoveLiquidity` reverts if `liquidityDelta < 0`. Collecting fees (`liquidityDelta == 0`) is allowed at the hook; the vault does not `collectFees` or re-approve the NFT to the borrower.
8. **Repay:** borrower pays flat interest before the deadline → hook unlocks → `safeTransferFrom` returns the NFT to `loan.borrower` → decrease liquidity works again.
9. **Default:** after the deadline, anyone may `liquidate` (requires `ownerOf == vault`; no pull from the borrower) then `withdrawSeizedLiquidity` (burn the seized position).

```
Borrower ──approve NFT──► PositionManager
       └──lockPosition──► LendingVault ──registerLock──► CollateralLockHook
                              │
                              └── PositionLocked ──► relayer
                                                       │
                                                       ├── cre workflow simulate (handlerInTee)
                                                       │     returns { ltvBps, aprBps, expiry }
                                                       └── submitCreditReport ──► vdUSD to borrower
```

## Code map

Line numbers on `main`. Uniswap v4 contracts live under `contracts/src/` (this repo is based on the [v4 hook template](https://github.com/uniswapfoundation/v4-template)).

| What | Where |
|---|---|
| Revert decrease while locked | [`CollateralLockHook._beforeRemoveLiquidity`](https://github.com/harundarat/veilend/blob/main/contracts/src/CollateralLockHook.sol#L76-L87) — `locked[id] && liquidityDelta < 0` |
| Lock collateral (custody NFT in vault) | [`LendingVault.lockPosition`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L123-L161) |
| Relayer writes terms and disburses | [`LendingVault.submitCreditReport`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L170-L190) |
| Valuation + principal | [`_valueOf`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L314-L322) / `principal = collateralValue * ltvBps / 10000` in [`_submitCreditReport`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L279-L311) |
| Flat repay + unlock + return NFT | [`LendingVault.repayLoan`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L192-L213) |
| Liquidate after deadline (NFT already in vault) | [`LendingVault.liquidate`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L215-L232) |
| Burn seized LP | [`LendingVault.withdrawSeizedLiquidity`](https://github.com/harundarat/veilend/blob/main/contracts/src/LendingVault.sol#L234-L264) |
| TEE handler (LTV is decided here) | [`handlerInTee`](https://github.com/harundarat/veilend/blob/main/cre-workflow/credit-scoring-workflow/workflow.ts#L113-L131) → [`onHttpTrigger`](https://github.com/harundarat/veilend/blob/main/cre-workflow/credit-scoring-workflow/workflow.ts#L92-L111) |
| Scoring formula (plan §13.4) | [`scoreToTerms`](https://github.com/harundarat/veilend/blob/main/cre-workflow/credit-scoring-workflow/scoring.ts#L69-L87) |
| Event → simulate → report | [`handlePositionLocked`](https://github.com/harundarat/veilend/blob/main/relayer/src/index.ts#L79-L121) / [`runCreSimulate`](https://github.com/harundarat/veilend/blob/main/relayer/src/simulate.ts#L30-L57) |

Uniswap tooling notes (not product pitch): [`FEEDBACK.md`](FEEDBACK.md). Evidence index: [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

## Run the demo

### Foundry tests (lock, collect vs decrease, repay, liquidate)

```bash
cd contracts
forge test --match-contract 'LendingVaultTest|VeilendIntegrationTest|CollateralLockHookTest'
```

50 tests across those three contracts. Includes `test_lockPosition_succeeds`, `test_repayLoan_pullsFlatInterestAndUnlocks`, `test_repayLoan_unlocksAndAllowsDecrease`, `test_liquidate_succeedsAfterBorrowerRevokesApproval`, `test_liquidate_thenWithdrawSeizedLiquidity`.

### CRE simulate (terms only)

Needs the CRE CLI and `cre-workflow/.env` from [`.env.example`](cre-workflow/.env.example) (`SECRET_API_TOKEN` may be a dummy for simulate). This is **simulation**, not a live Confidential Workflows deploy.

```bash
cd cre-workflow
bun install --cwd ./credit-scoring-workflow
cre workflow simulate credit-scoring-workflow --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload ../docs/cre-simulation/payload-wallet-a.json
```

Swap the payload for `payload-wallet-b.json` / `payload-wallet-c.json`. Captured logs: [`docs/cre-simulation/`](docs/cre-simulation/).

Unit tests without the CLI: `cd cre-workflow/credit-scoring-workflow && bun test`.

### Relayer (lock → simulate → disburse)

Copy [`relayer/.env.example`](relayer/.env.example) to `relayer/.env` (never commit it). `RELAYER_PRIVATE_KEY` must match `LendingVault.relayer()`.

```bash
bun install --cwd relayer
bun run --cwd relayer src/index.ts --once --from-block <lock_block>
```

End-to-end lock → report → disburse on an Anvil **fork** of Sepolia: [`docs/e2e-lock-disburse/`](docs/e2e-lock-disburse/).

## Limitations (read these)

Judges should treat these as known MVP constraints, not hidden gaps.

- **Demo pool only.** Collateral is accepted only from the Veilend pool initialized with this hook. Existing Uniswap v4 LP (ETH/USDC, etc.) cannot be locked: a v4 hook is part of `PoolKey`, not of an NFT.
- **No oracle.** `_valueOf` uses `amount0Snapshot + amount1Snapshot` when the relayer supplies a snapshot `> 0`; otherwise `collateralValue = getPositionLiquidity` (1 unit of liquidity = 1 mock-USD). The captured e2e used the liquidity fallback.
- **Trusted relayer, not DON verification.** CRE ↔ vault is `onlyRelayer` + `cre workflow simulate` from a Bun script. Production would replace this with on-chain CRE report verification.
- **Vault custody while locked.** `lockPosition` pulls the NFT into the vault. Revoking approval or transferring from the borrower afterwards does not move it and does not block `liquidate`. The hook still reverts `liquidityDelta < 0` until repay or liquidate unlocks. There is no vault `collectFees`; fees accrue on the position and the borrower collects after repay returns the NFT. On liquidate, fees are pulled with the liquidity.
- **`GRACE_PERIOD = 300` seconds** — demo/testnet only. A production grace period would be days.
- **Flat repay, not pro-rata.** `repayAmount = principal + principal * aprBps / 10000`, independent of how long the loan was open.
- **Hybrid / partly simulated credit data.** TEE history is a lookup of three demo wallets in workflow config (`pastLoansCount` + `onTimeRepaymentRate`). One on-chain LP data point (`liquidity` + age from `Transfer` mint logs) is used when the PositionManager read succeeds. Simulate wallets A/B/C use `dataSource=config` (tokenIds `1000001–1000003` do not exist). The fork e2e on position `39014` used `dataSource=onchain`. Intermediate scores stay in the enclave; stdout is only `{ ltvBps, aprBps, expiry }`.

## Chainlink evidence

Confidential handler: `handlerInTee` in [`workflow.ts`](cre-workflow/credit-scoring-workflow/workflow.ts). It fetches a secret (`API_TOKEN`), looks up history, reads LP data (or config fallback), and returns **only** terms.

Captured CLI runs ([`docs/cre-simulation/`](docs/cre-simulation/)):

| Wallet | Payload | `ltvBps` | `aprBps` | `dataSource` |
|---|---|---|---|---|
| A (excellent) | `payload-wallet-a.json` | 7000 | 500 | config |
| B (average) | `payload-wallet-b.json` | 5500 | 800 | config |
| C (risky) | `payload-wallet-c.json` | 2000 | 1800 | config |

Example result body (wallet A):

```json
{
  "aprBps": 500,
  "expiry": 1788924365,
  "ltvBps": 7000
}
```

Fork e2e (real NFT `39014`): `ltvBps=5500 aprBps=800 dataSource=onchain` — [`docs/e2e-lock-disburse/`](docs/e2e-lock-disburse/).

## Sepolia addresses

Contracts below were broadcast to Ethereum Sepolia. The lock → CRE → disburse walkthrough in `docs/e2e-lock-disburse/` ran against an **Anvil fork** of that state (no extra testnet broadcast for the report).

| | Address |
|---|---|
| `CollateralLockHook` | [`0xc727Bf24715514A5C574A001AaC0d7c0eC7EC200`](https://sepolia.etherscan.io/address/0xc727Bf24715514A5C574A001AaC0d7c0eC7EC200) |
| `LendingVault` | [`0xFf1E171F9A4484D6cb034d68557d30C03934BFc9`](https://sepolia.etherscan.io/address/0xFf1E171F9A4484D6cb034d68557d30C03934BFc9) |
| Mock `vUSD` | [`0x5a88a2E133251E2F92734e721b13CA6C60De6f09`](https://sepolia.etherscan.io/address/0x5a88a2E133251E2F92734e721b13CA6C60De6f09) |
| Mock `vEUR` | [`0xFbc717e1d5536699afD569860B09aC39C6f16862`](https://sepolia.etherscan.io/address/0xFbc717e1d5536699afD569860B09aC39C6f16862) |
| Mock `vdUSD` (loan token) | [`0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e`](https://sepolia.etherscan.io/address/0xfe9E69853F0D7488b23CbCA8331E70c351f3bf8e) |
| Demo pool id | `0x8ca493510350e7ae46e05d9d04db161f2d3f0df33ee9f3fdfaf1601477c82042` |
| Demo LP NFT `tokenId` | `39014` |
| Uniswap v4 PoolManager | [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543) |
| Uniswap v4 PositionManager | [`0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`](https://sepolia.etherscan.io/address/0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4) |

More deploy detail: [`contracts/README.md`](contracts/README.md).

## Demo video

To be added for the ETHOnline 2026 submission (terminal + explorer; UI not required).

| Time | Step |
|---|---|
| — | `lockPosition` (NFT `approve` visible) |
| — | `cre workflow simulate` or relayer spawn; show `{ ltvBps, aprBps, expiry }` |
| — | `vdUSD` disbursed to borrower |
| — | Decrease liquidity reverts; collect fee succeeds |
| — | `repayLoan` → unlock → decrease works **and/or** `liquidate` + `withdrawSeizedLiquidity` |

## License

MIT. See [`LICENSE`](LICENSE).
