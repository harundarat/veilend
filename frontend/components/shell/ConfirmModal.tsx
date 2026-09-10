"use client";

import { useEffect, type ReactNode } from "react";
import { AlertIcon } from "./icons";

export type ConfirmModalProps = {
  open: boolean;
  title: string;
  amountLabel?: string;
  amount?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function ConfirmModal({
  open,
  title,
  amountLabel,
  amount,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const accent = danger ? "var(--color-danger)" : "var(--color-acid)";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ground)_78%,transparent)] backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md border border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <h2 className="font-mono text-lg font-bold tracking-tight text-[var(--color-ink)]">
          {title}
        </h2>

        {amount ? (
          <div className="mt-5 flex items-baseline justify-between border-y border-[var(--color-hairline)] py-4">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              {amountLabel}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {amount}
            </span>
          </div>
        ) : null}

        {children ? (
          <div className="mt-4 text-sm leading-relaxed text-[var(--color-ink-dim)]">
            {children}
          </div>
        ) : null}

        <div className="mt-5 flex items-start gap-2.5 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] p-3">
          <span className="mt-0.5 shrink-0" style={{ color: accent }}>
            <AlertIcon className="size-4" />
          </span>
          <p className="font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
            This cannot be undone.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-[var(--color-hairline-hi)] px-4 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 border px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:brightness-95"
            style={{ background: accent, borderColor: accent }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
