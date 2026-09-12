import { type Address } from "viem";
import {
  ADDRESSES,
  isDemoPool,
  type PoolKeyResult,
  type VaultLoan,
} from "@/lib/contracts";
import { isBorrowerOf, pairLabel, sameAddress } from "@/lib/positions/hydrate";

export type InventoryTab = "wallet" | "vault" | "closed";

export type InventoryStatus = "ready" | "active" | "closed" | "liquidated";

export const INVENTORY_STATUS_META: Record<
  InventoryStatus,
  { label: string; color: string }
> = {
  ready: { label: "Ready to lock", color: "var(--color-acid)" },
  active: { label: "Active loan", color: "var(--color-warn)" },
  closed: { label: "Closed", color: "var(--color-ok)" },
  liquidated: { label: "Liquidated", color: "var(--color-danger)" },
};

export type InventoryItem = {
  tokenId: bigint;
  owner?: Address;
  liquidity: bigint;
  poolKey?: PoolKeyResult;
  loan?: VaultLoan;
  tab: InventoryTab;
  status: InventoryStatus;
  previouslyUsed?: boolean;
};

export function inventoryStatus(loan: VaultLoan | undefined): InventoryStatus {
  if (loan?.liquidated) return "liquidated";
  if (loan?.repaid) return "closed";
  if (loan?.locked || loan?.active) return "active";
  return "ready";
}

export function hasLoanTerms(loan: VaultLoan | undefined) {
  if (!loan) return false;
  return loan.active || loan.repaid || loan.liquidated;
}

export function inventoryPairLabel(poolKey?: PoolKeyResult) {
  if (poolKey) return pairLabel(poolKey);
  return "vUSD / vEUR";
}

export function ownerKind(owner: Address | undefined): "wallet" | "vault" | "unknown" {
  if (!owner) return "unknown";
  if (sameAddress(owner, ADDRESSES.vault)) return "vault";
  return "wallet";
}

export function classifyInventory(input: {
  tokenId: bigint;
  owner?: Address;
  liquidity?: bigint;
  poolKey?: PoolKeyResult;
  loan?: VaultLoan;
  wallet?: Address;
}): InventoryItem[] {
  const { tokenId, owner, poolKey, loan, wallet } = input;
  if (!wallet) return [];

  const isOwner = sameAddress(owner, wallet);
  const isBorrower = isBorrowerOf(loan, wallet);
  const status = inventoryStatus(loan);
  const liquidity = input.liquidity ?? BigInt(0);
  const demo = poolKey ? isDemoPool(poolKey) : false;
  const items: InventoryItem[] = [];

  if (status === "closed" || status === "liquidated") {
    if ((isBorrower || isOwner) && (!poolKey || demo)) {
      items.push({ tokenId, owner, liquidity, poolKey, loan, tab: "closed", status });
    }
  } else if (status === "active") {
    if (isBorrower && (!poolKey || demo)) {
      items.push({ tokenId, owner, liquidity, poolKey, loan, tab: "vault", status });
    }
    return items;
  }

  if (isOwner && poolKey && demo && status !== "liquidated") {
    items.push({
      tokenId,
      owner,
      liquidity,
      poolKey,
      tab: "wallet",
      status: "ready",
      previouslyUsed: status === "closed",
    });
  }

  return items;
}
