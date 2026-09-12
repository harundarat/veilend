import { describe, expect, test } from "bun:test";
import { type Address } from "viem";
import { ADDRESSES, type PoolKeyResult, type VaultLoan } from "../contracts";
import { formatLiquidity } from "../format";
import { derivePhase } from "./hydrate";
import { classifyInventory } from "./inventory";

const WALLET = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;

const demoPool: PoolKeyResult = {
  currency0: ADDRESSES.vusd,
  currency1: ADDRESSES.veur,
  fee: 3000,
  tickSpacing: 60,
  hooks: ADDRESSES.hook,
};

function loan(overrides: Partial<VaultLoan> = {}): VaultLoan {
  return {
    borrower: WALLET,
    positionId: 1n,
    ltvBps: 5000n,
    aprBps: 500n,
    expiry: 1n,
    defaultDeadline: 2n,
    collateralValue: 100n,
    principal: 50n,
    active: false,
    locked: false,
    repaid: false,
    liquidated: false,
    ...overrides,
  };
}

describe("classifyInventory", () => {
  test("owned unused LP is wallet-only", () => {
    const items = classifyInventory({
      tokenId: 1n,
      owner: WALLET,
      liquidity: 10n,
      poolKey: demoPool,
      wallet: WALLET,
    });
    expect(items.map((item) => item.tab)).toEqual(["wallet"]);
    expect(items[0]?.previouslyUsed).toBe(false);
  });

  test("active loan is vault-only", () => {
    const items = classifyInventory({
      tokenId: 1n,
      owner: ADDRESSES.vault,
      liquidity: 10n,
      poolKey: demoPool,
      loan: loan({ active: true, locked: true }),
      wallet: WALLET,
    });
    expect(items.map((item) => item.tab)).toEqual(["vault"]);
  });

  test("repaid and owned appears in closed and wallet", () => {
    const items = classifyInventory({
      tokenId: 39203n,
      owner: WALLET,
      liquidity: 10n,
      poolKey: demoPool,
      loan: loan({ repaid: true }),
      wallet: WALLET,
    });
    expect(items.map((item) => item.tab).sort()).toEqual(["closed", "wallet"]);
    const wallet = items.find((item) => item.tab === "wallet");
    expect(wallet?.status).toBe("ready");
    expect(wallet?.previouslyUsed).toBe(true);
    expect(wallet?.loan).toBeUndefined();
    expect(items.find((item) => item.tab === "closed")?.loan?.repaid).toBe(true);
  });

  test("repaid but not owned stays closed-only", () => {
    const items = classifyInventory({
      tokenId: 1n,
      owner: OTHER,
      liquidity: 10n,
      poolKey: demoPool,
      loan: loan({ repaid: true }),
      wallet: WALLET,
    });
    expect(items.map((item) => item.tab)).toEqual(["closed"]);
  });

  test("liquidated stays closed-only even if somehow owned", () => {
    const items = classifyInventory({
      tokenId: 1n,
      owner: WALLET,
      liquidity: 0n,
      poolKey: demoPool,
      loan: loan({ liquidated: true }),
      wallet: WALLET,
    });
    expect(items.map((item) => item.tab)).toEqual(["closed"]);
    expect(items[0]?.status).toBe("liquidated");
  });
});

describe("derivePhase", () => {
  test("owned repaid NFT is lockable", () => {
    expect(derivePhase(loan({ repaid: true }), WALLET, WALLET, false)).toBe("found");
    expect(derivePhase(loan({ repaid: true }), WALLET, WALLET, true)).toBe("approved");
  });

  test("repaid NFT not in wallet stays repaid", () => {
    expect(derivePhase(loan({ repaid: true }), OTHER, WALLET, false)).toBe("repaid");
  });

  test("active loan is unchanged", () => {
    expect(
      derivePhase(loan({ active: true, locked: true }), ADDRESSES.vault, WALLET, false),
    ).toBe("active");
  });
});

describe("formatLiquidity", () => {
  test("formats Uniswap L as 18-decimal mock-USD", () => {
    expect(formatLiquidity(105_240_396_777_600_467_992n)).toBe("105.24");
  });

  test("does not dump a raw integer string", () => {
    expect(formatLiquidity(105_240_396_777_600_467_992n)).not.toContain(",");
  });
});
