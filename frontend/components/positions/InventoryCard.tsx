"use client";

import Link from "next/link";
import {
  ADDRESSES,
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
} from "@/lib/contracts";
import { formatBps, formatLiquidity, formatToken, truncateAddress } from "@/lib/format";
import {
  INVENTORY_STATUS_META,
  hasLoanTerms,
  inventoryPairLabel,
  ownerKind,
  type InventoryItem,
} from "@/lib/positions/inventory";

export function InventoryCardSkeleton() {
  return (
    <div
      className="h-64 animate-pulse border border-[var(--color-hairline)] bg-[var(--color-panel)]"
      aria-hidden="true"
    />
  );
}

function OwnerBadge({ owner }: { owner?: InventoryItem["owner"] }) {
  const kind = ownerKind(owner);
  const isVault = kind === "vault";
  const color =
    kind === "unknown" ? "var(--color-ink-faint)" : isVault ? "var(--color-warn)" : "var(--color-ok)";
  const label =
    kind === "unknown"
      ? "BURNED"
      : isVault
        ? `VAULT · ${truncateAddress(owner ?? ADDRESSES.vault)}`
        : `WALLET · ${truncateAddress(owner ?? "")}`;

  return (
    <span
      className="inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
      style={{ borderColor: color, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function deadlineLabel(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InventoryCard({
  item,
  highlighted,
}: {
  item: InventoryItem;
  highlighted?: boolean;
}) {
  const meta = INVENTORY_STATUS_META[item.status];
  const terms = hasLoanTerms(item.loan);
  const id = item.tokenId.toString();
  const primary =
    item.tab === "wallet"
      ? { href: `/app?id=${id}`, label: "Open in Borrow" }
      : item.tab === "vault"
        ? { href: `/loan?id=${id}`, label: "Open in Loan" }
        : { href: `/loan?id=${id}`, label: "Inspect loan" };

  return (
    <article
      className={`flex flex-col border bg-[var(--color-panel)] p-6 transition-colors hover:bg-[var(--color-panel-hi)] ${
        highlighted ? "border-[var(--color-acid)]" : "border-[var(--color-hairline)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Token ID
          </span>
          <p className="font-mono text-2xl font-bold tracking-tight text-[var(--color-ink)]">
            #{id}
          </p>
        </div>
        <span
          className="border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest"
          style={{ borderColor: meta.color, color: meta.color }}
        >
          {meta.label}
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--color-hairline)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Owner
          </span>
          <OwnerBadge owner={item.owner} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Pair
          </span>
          <span className="font-mono text-sm text-[var(--color-ink)]">
            {inventoryPairLabel(item.poolKey)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
            Liquidity
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
            {item.liquidity > BigInt(0)
              ? formatLiquidity(item.liquidity)
              : terms && item.loan
                ? `${formatToken(item.loan.collateralValue, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`
                : "—"}
          </span>
        </div>
        {item.tab !== "wallet" ? (
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              LTV
            </span>
            <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
              {terms && item.loan ? formatBps(item.loan.ltvBps) : "Pending"}
            </span>
          </div>
        ) : null}
        {terms && item.loan ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                Principal
              </span>
              <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
                {formatToken(item.loan.principal, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
              </span>
            </div>
            {item.loan.defaultDeadline > BigInt(0) ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                  Deadline
                </span>
                <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
                  {deadlineLabel(Number(item.loan.defaultDeadline) * 1000)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <Link
        href={primary.href}
        className="mt-6 flex items-center justify-center gap-2 border border-[var(--color-hairline-hi)] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
      >
        {primary.label} →
      </Link>
      {item.status === "liquidated" ? (
        <Link
          href={`/liquidate?id=${id}`}
          className="mt-2 text-center font-mono text-[11px] uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-acid)]"
        >
          View on Liquidate →
        </Link>
      ) : null}
    </article>
  );
}
