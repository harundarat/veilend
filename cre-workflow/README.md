# Veilend CRE credit scoring

Confidential HTTP workflow. `handlerInTee` scores a borrower/position and returns only `{ ltvBps, aprBps, expiry }`. Simulation works without Confidential Workflows enrollment; deploy does not.

```bash
cd cre-workflow
cp .env.example .env   # set SECRET_API_TOKEN (dummy is fine for simulate)
bun install --cwd ./credit-scoring-workflow
cre workflow simulate credit-scoring-workflow --target staging-settings \
  --non-interactive --trigger-index 0 \
  --http-payload ../docs/cre-simulation/payload-wallet-a.json
```

Unit tests (no CRE CLI):

```bash
cd credit-scoring-workflow && bun test
```

Payloads and captured CLI logs: `docs/cre-simulation/`.
