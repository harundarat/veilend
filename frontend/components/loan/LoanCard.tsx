"use client";

import {
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
  type VaultLoan,
} from "@/lib/contracts";
import { formatBps, formatToken } from "@/lib/format";
import {
  LOAN_STATUS_META,
  loanUiStatus,
  type HydratedPosition,
} from "@/lib/positions/hydrate";

export function LoanCardSkeleton() {
  return (
    <div
      className="h-40 animate-pulse border border-[var(--color-hairline)] bg-[var(--color-panel)]"
      aria-hidden="true"
    />
  );
}

function deadlineLabel(loan: VaultLoan) {
  if (loan.defaultDeadline <= BigInt(0)) return "—";
  return new Date(Number(loan.defaultDeadline) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LoanCard({
  position,
  onView,
}: {
  position: HydratedPosition;
  onView: () => void;
}) {
  const status = loanUiStatus(position.loan);
  const meta = status ? LOAN_STATUS_META[status] : null;
  const loan = position.loan;
  const hasTerms = status === "active" || status === "repaid" || status === "liquidated";

  return (
    <article className="flex flex-col border border-[var(--color-hairline)] bg-[var(--color-panel)] p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-sm text-[var(--color-ink)]">
          #{position.tokenId.toString()}
        </p>
        {meta ? (
          <span
            className="border px-2 py-1 font-mono text-[10px] uppercase tracking-widest"
            style={{ borderColor: meta.color, color: meta.color }}
          >
            {meta.label}
          </span>
        ) : null}
      </div>
      <dl className="mt-4 flex flex-col gap-1.5 font-mono text-[11px] text-[var(--color-ink-dim)]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="uppercase tracking-widest">Principal</dt>
          <dd className="tabular-nums text-[var(--color-ink)]">
            {hasTerms && loan
              ? `${formatToken(loan.principal, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`
              : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="uppercase tracking-widest">LTV</dt>
          <dd className="tabular-nums text-[var(--color-ink)]">
            {hasTerms && loan ? formatBps(loan.ltvBps) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="uppercase tracking-widest">Deadline</dt>
          <dd className="tabular-nums text-[var(--color-ink)]">
            {hasTerms && loan ? deadlineLabel(loan) : "—"}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onView}
        className="mt-4 inline-flex items-center justify-center border border-[var(--color-acid)] bg-[var(--color-acid)] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)]"
      >
        View
      </button>
    </article>
  );
}
