import { type Address, zeroAddress } from "viem";
import {
  ADDRESSES,
  isDemoPool,
  type PoolKeyResult,
  type VaultLoan,
} from "@/lib/contracts";
import { truncateAddress } from "@/lib/format";

export type Phase =
  | "found"
  | "approved"
  | "locked"
  | "active"
  | "repaid"
  | "liquidated";

export type CardStatus = "eligible" | "locked";

export type LoanUiStatus = "locked" | "active" | "repaid" | "liquidated";

export const LOAN_STATUS_META: Record<LoanUiStatus, { label: string; color: string }> = {
  locked: { label: "Locked — waiting CRE", color: "var(--color-warn)" },
  active: { label: "Active", color: "var(--color-acid)" },
  repaid: { label: "Repaid", color: "var(--color-ok)" },
  liquidated: { label: "Liquidated", color: "var(--color-danger)" },
};

export type HydratedPosition = {
  tokenId: bigint;
  owner: Address;
  liquidity: bigint;
  poolKey: PoolKeyResult;
  loan: VaultLoan | undefined;
  status: CardStatus;
};

export function asLoan(value: unknown): VaultLoan | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const [
      borrower,
      positionId,
      ltvBps,
      aprBps,
      expiry,
      defaultDeadline,
      collateralValue,
      principal,
      active,
      locked,
      repaid,
      liquidated,
    ] = value as [
      Address,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      bigint,
      boolean,
      boolean,
      boolean,
      boolean,
    ];
    return {
      borrower,
      positionId,
      ltvBps,
      aprBps,
      expiry,
      defaultDeadline,
      collateralValue,
      principal,
      active,
      locked,
      repaid,
      liquidated,
    };
  }
  return value as VaultLoan;
}

export function asPoolKey(value: unknown): PoolKeyResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    const first = value[0] as PoolKeyResult | unknown[];
    if (Array.isArray(first)) {
      const [currency0, currency1, fee, tickSpacing, hooks] = first as [
        Address,
        Address,
        number,
        number,
        Address,
      ];
      return { currency0, currency1, fee, tickSpacing, hooks };
    }
    if (first && typeof first === "object" && "currency0" in first) {
      return first as PoolKeyResult;
    }
    return undefined;
  }
  if ("currency0" in value) return value as PoolKeyResult;
  if ("poolKey" in value) return asPoolKey((value as { poolKey: unknown }).poolKey);
  return undefined;
}

export function sameAddress(a?: string, b?: string) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function isBorrowerOf(loan: VaultLoan | undefined, wallet?: Address) {
  return (
    Boolean(loan) &&
    !sameAddress(loan?.borrower, zeroAddress) &&
    sameAddress(loan?.borrower, wallet)
  );
}

export function hasLoan(loan: VaultLoan | undefined) {
  return Boolean(loan && !sameAddress(loan.borrower, zeroAddress));
}

export function loanUiStatus(loan: VaultLoan | undefined): LoanUiStatus | null {
  if (!hasLoan(loan) || !loan) return null;
  if (loan.liquidated) return "liquidated";
  if (loan.repaid) return "repaid";
  if (loan.active) return "active";
  if (loan.locked) return "locked";
  return null;
}

export function isWalletLoan(loan: VaultLoan | undefined, wallet?: Address) {
  return isBorrowerOf(loan, wallet) && loanUiStatus(loan) !== null;
}

export type LiquidateUiStatus = "active" | "eligible" | "liquidated" | "withdrawn";

export const LIQUIDATE_STATUS_META: Record<
  LiquidateUiStatus,
  { label: string; color: string }
> = {
  active: { label: "NOT ELIGIBLE", color: "var(--color-ink-faint)" },
  eligible: { label: "LIQUIDATE", color: "var(--color-danger)" },
  liquidated: { label: "WITHDRAW", color: "var(--color-warn)" },
  withdrawn: { label: "CLOSED", color: "var(--color-ink-dim)" },
};

export type LiquidateAction = "liquidate" | "withdraw" | "closed" | "ineligible";

export function liquidateAction(status: LiquidateUiStatus | null): LiquidateAction {
  if (status === "eligible") return "liquidate";
  if (status === "liquidated") return "withdraw";
  if (status === "withdrawn") return "closed";
  return "ineligible";
}

export function isLiquidateActionable(status: LiquidateUiStatus | null) {
  return status === "eligible" || status === "liquidated";
}

export function isSeizedWithdrawn(loan: VaultLoan | undefined, owner?: Address) {
  if (!loan?.liquidated) return false;
  return !sameAddress(owner, ADDRESSES.vault);
}

export function isLiquidateEligible(loan: VaultLoan | undefined, nowMs: number) {
  if (!loan) return false;
  if (loan.liquidated || loan.repaid) return false;
  if (!loan.active || loan.principal <= BigInt(0)) return false;
  if (loan.defaultDeadline <= BigInt(0)) return false;
  return nowMs > Number(loan.defaultDeadline) * 1000;
}

export function liquidateUiStatus(
  loan: VaultLoan | undefined,
  owner: Address | undefined,
  nowMs: number,
): LiquidateUiStatus | null {
  if (!hasLoan(loan) || !loan || loan.repaid) return null;
  if (loan.liquidated) return isSeizedWithdrawn(loan, owner) ? "withdrawn" : "liquidated";
  if (isLiquidateEligible(loan, nowMs)) return "eligible";
  return "active";
}

export function derivePhase(
  loan: VaultLoan | undefined,
  owner: Address | undefined,
  wallet: Address | undefined,
  approved: boolean,
): Phase | null {
  if (!owner || !wallet) return null;
  const isOwner = sameAddress(owner, wallet);
  const inVault = sameAddress(owner, ADDRESSES.vault);
  const isBorrower = isBorrowerOf(loan, wallet);

  if (loan?.liquidated && (isBorrower || inVault)) return "liquidated";
  if (loan?.repaid && (isOwner || isBorrower)) return "repaid";
  if (loan?.active && isBorrower) return "active";
  if (loan?.locked && !loan.active && isBorrower) return "locked";
  if (isOwner && approved) return "approved";
  if (isOwner) return "found";
  return null;
}

export function pairLabel(poolKey: PoolKeyResult) {
  const symbol = (address: Address) => {
    if (sameAddress(address, ADDRESSES.vusd)) return "vUSD";
    if (sameAddress(address, ADDRESSES.veur)) return "vEUR";
    return truncateAddress(address);
  };
  return `${symbol(poolKey.currency0)} / ${symbol(poolKey.currency1)}`;
}

export function classifyPosition(input: {
  tokenId: bigint;
  owner?: Address;
  liquidity?: bigint;
  poolKey?: PoolKeyResult;
  loan?: VaultLoan;
  wallet?: Address;
}): { kind: "skip" } | { kind: "card"; position: HydratedPosition } {
  const { tokenId, owner, liquidity, poolKey, loan, wallet } = input;
  if (!owner || !wallet || !poolKey) return { kind: "skip" };
  if (!isDemoPool(poolKey)) return { kind: "skip" };

  const isOwner = sameAddress(owner, wallet);
  const isBorrower = isBorrowerOf(loan, wallet);
  if (!isOwner && !isBorrower) return { kind: "skip" };

  const live = Boolean(loan && isBorrower && (loan.locked || loan.active || loan.liquidated));
  if (live) {
    return {
      kind: "card",
      position: {
        tokenId,
        owner,
        liquidity: liquidity ?? BigInt(0),
        poolKey,
        loan,
        status: "locked",
      },
    };
  }

  if (!isOwner) return { kind: "skip" };

  return {
    kind: "card",
    position: {
      tokenId,
      owner,
      liquidity: liquidity ?? BigInt(0),
      poolKey,
      loan,
      status: "eligible",
    },
  };
}
