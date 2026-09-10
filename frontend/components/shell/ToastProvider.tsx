"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChainId } from "wagmi";
import { explorerTxUrl, truncateAddress } from "@/lib/format";
import { AlertIcon, CheckIcon, ExternalIcon } from "./icons";

export type ToastStatus = "pending" | "success" | "reverted";

export type Toast = {
  id: string;
  status: ToastStatus;
  title: string;
  message?: string;
  txHash?: string;
};

type PushInput = Omit<Toast, "id">;

type ToastContextValue = {
  toasts: Toast[];
  push: (toast: PushInput) => string;
  update: (id: string, patch: Partial<Omit<Toast, "id">>) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS: Record<ToastStatus, number | null> = {
  pending: null,
  success: 6000,
  reverted: 8000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, status: ToastStatus) => {
      if (timers.current[id]) clearTimeout(timers.current[id]);
      const delay = AUTO_DISMISS[status];
      if (delay != null) {
        timers.current[id] = setTimeout(() => dismiss(id), delay);
      }
    },
    [dismiss],
  );

  const push = useCallback(
    (toast: PushInput) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...toast, id }]);
      scheduleDismiss(id, toast.status);
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<Toast, "id">>) => {
      setToasts((prev) =>
        prev.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)),
      );
      if (patch.status) scheduleDismiss(id, patch.status);
    },
    [scheduleDismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, update, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" aria-hidden="true">
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

const ACCENT: Record<Toast["status"], string> = {
  pending: "var(--color-warn)",
  success: "var(--color-ok)",
  reverted: "var(--color-danger)",
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const chainId = useChainId();
  const accent = ACCENT[toast.status];
  const href = toast.txHash ? explorerTxUrl(toast.txHash, chainId) : undefined;

  return (
    <div
      className="pointer-events-auto flex gap-3 border bg-[var(--color-panel)] p-3.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
      style={{ borderColor: accent }}
      role="status"
    >
      <span className="mt-0.5 shrink-0" style={{ color: accent }}>
        {toast.status === "pending" && <Spinner />}
        {toast.status === "success" && <CheckIcon className="size-4" />}
        {toast.status === "reverted" && <AlertIcon className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="font-mono text-xs font-semibold uppercase tracking-wider"
          style={{ color: accent }}
        >
          {toast.title}
        </p>
        {toast.message ? (
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
            {toast.message}
          </p>
        ) : null}
        {toast.txHash ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-acid)]"
            >
              {truncateAddress(toast.txHash)}
              <ExternalIcon className="size-3" />
            </a>
          ) : (
            <p className="mt-1.5 font-mono text-[11px] text-[var(--color-ink-dim)]">
              {truncateAddress(toast.txHash)}
            </p>
          )
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 self-start font-mono text-xs text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastSlot() {
  const { toasts, dismiss } = useToast();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[330px] max-w-[calc(100vw-2.5rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}
