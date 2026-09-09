On-chain `getPositionLiquidity` / mint-log reads for demo tokenIds 1000001–1000003 revert (those NFTs do not exist on Sepolia PositionManager).
`handlerInTee` then uses `config.demoPositions` (`dataSource=config` in the logs).
CLI simulation still compiles and returns terms-only `{ ltvBps, aprBps, expiry }`.
Wallet A/B/C LTV: 7000 / 5500 / 2000.
