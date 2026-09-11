"use client";

import Link from "next/link";
import {
  pairLabel,
  type HydratedPosition,
} from "@/lib/positions/hydrate";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className ?? ""}`}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="var(--color-hairline-hi)" strokeWidth="2.5" />
      <path
        d="M12 3 a9 9 0 0 1 9 9"
        stroke="var(--color-acid)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PositionCardSkeleton() {
  return (
    <div
      className="h-40 animate-pulse border border-[var(--color-hairline)] bg-[var(--color-panel)]"
      aria-hidden="true"
    />
  );
}

export function PositionCard({
  position,
  selected,
  pending,
  canWrite,
  onSelect,
  onLock,
}: {
  position: HydratedPosition;
  selected: boolean;
  pending: boolean;
  canWrite: boolean;
  onSelect: () => void;
  onLock: () => void;
}) {
  const locked = position.status === "locked";
  return (
    <article
      className={`flex flex-col border bg-[var(--color-panel)] p-5 ${
        selected
          ? "border-[var(--color-acid)]"
          : "border-[var(--color-hairline)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="text-left font-mono text-sm text-[var(--color-ink)] hover:text-[var(--color-acid)]"
        >
          #{position.tokenId.toString()}
        </button>
        <span
          className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${
            locked
              ? "border-[var(--color-warn)] text-[var(--color-warn)]"
              : "border-[var(--color-acid)] text-[var(--color-acid)]"
          }`}
        >
          {locked ? "Locked" : "Eligible"}
        </span>
      </div>
      <p className="mt-3 font-mono text-xs uppercase tracking-widest text-[var(--color-ink-dim)]">
        {pairLabel(position.poolKey)}
      </p>
      {locked ? null : (
        <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          LTV and principal are set after you lock — scored privately.
        </p>
      )}
      {locked ? (
        <Link
          href={`/loan/${position.tokenId.toString()}`}
          className="mt-4 inline-flex items-center justify-center gap-2 border border-[var(--color-hairline-hi)] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-acid)] hover:text-[var(--color-acid)]"
        >
          View terms
        </Link>
      ) : (
        <button
          type="button"
          onClick={onLock}
          disabled={!canWrite || pending}
          className="mt-4 inline-flex items-center justify-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending && <Spinner className="size-3.5" />}
          Lock & request terms
        </button>
      )}
    </article>
  );
}
