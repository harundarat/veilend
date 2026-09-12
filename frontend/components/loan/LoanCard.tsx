"use client";

import type { ReactNode } from "react";
import {
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
  repayAmountOf,
  type VaultLoan,
} from "@/lib/contracts";
import { formatBps, formatToken } from "@/lib/format";
import {
  LOAN_STATUS_META,
  loanUiStatus,
  type HydratedPosition,
} from "@/lib/positions/hydrate";
import { AlertIcon } from "@/components/shell/icons";
import { useNow } from "@/lib/use-now";

export function LoanCardSkeleton() {
  return (
    <div
      className="h-52 animate-pulse border border-[var(--color-hairline)] bg-[var(--color-panel)]"
      aria-hidden="true"
    />
  );
}

function deadlineDate(loan: VaultLoan) {
  if (loan.defaultDeadline <= BigInt(0)) return "—";
  return new Date(Number(loan.defaultDeadline) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DeadlineValue({ loan, active }: { loan: VaultLoan; active: boolean }) {
  const now = useNow();
  if (!active) return <>{deadlineDate(loan)}</>;
  if (loan.defaultDeadline <= BigInt(0)) return <>{"—"}</>;

  const deadlineMs = Number(loan.defaultDeadline) * 1000;
  const remaining = deadlineMs - now;
  if (now <= 0) return <>{deadlineDate(loan)}</>;
  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--color-danger)]">
        <AlertIcon className="size-3" /> Past due
      </span>
    );
  }

  const d = Math.floor(remaining / 86_400_000);
  const h = Math.floor((remaining % 86_400_000) / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return (
    <span className="tabular-nums">
      {d}d {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="uppercase tracking-widest">{label}</dt>
      <dd className="tabular-nums text-[var(--color-ink)]">{children}</dd>
    </div>
  );
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
  const due = hasTerms && loan ? repayAmountOf(loan) : null;

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
        <Row label="Due">
          {due
            ? `${formatToken(due, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`
            : "—"}
        </Row>
        <Row label="APR">{hasTerms && loan ? formatBps(loan.aprBps) : "—"}</Row>
        <Row label="LTV">{hasTerms && loan ? formatBps(loan.ltvBps) : "—"}</Row>
        <Row label="Deadline">
          {hasTerms && loan ? (
            <DeadlineValue loan={loan} active={status === "active"} />
          ) : (
            "—"
          )}
        </Row>
      </dl>
      <button
        type="button"
        onClick={onView}
        className="mt-4 inline-flex items-center justify-center border border-[var(--color-acid)] bg-[var(--color-acid)] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)]"
      >
        View Loan
      </button>
    </article>
  );
}
