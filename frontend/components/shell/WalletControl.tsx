"use client";

import { truncateAddress } from "@/lib/format";
import { useWalletUi } from "@/lib/use-wallet-ui";

function NetworkPill() {
  const { state, chain } = useWalletUi();

  if (state === "wrong-network") {
    return (
      <span className="hidden items-center gap-2 border border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] px-3 py-1.5 font-mono text-xs tracking-wide text-[var(--color-danger)] sm:inline-flex">
        <span className="size-1.5 rounded-full bg-[var(--color-danger)]" />
        Wrong network
      </span>
    );
  }

  const dim = state === "disconnected";
  return (
    <span
      className={`hidden items-center gap-2 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-1.5 font-mono text-xs tracking-wide sm:inline-flex ${
        dim ? "text-[var(--color-ink-dim)]" : "text-[var(--color-ink)]"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${dim ? "bg-[var(--color-ink-faint)]" : "bg-[var(--color-ok)]"}`}
      />
      {chain}
    </span>
  );
}

export function WalletControl() {
  const { state, address, connect, disconnect, isPending, error } = useWalletUi();

  return (
    <div className="flex items-center gap-2.5">
      <NetworkPill />

      {state === "disconnected" || !address ? (
        <div className="flex flex-col items-end">
          <button
            type="button"
            onClick={connect}
            disabled={isPending}
            className="whitespace-nowrap border border-[var(--color-acid)] bg-[var(--color-acid)] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-acid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ground)] disabled:opacity-60 sm:px-4"
          >
            {isPending ? "Connecting" : "Connect"}
            <span className="hidden sm:inline">{isPending ? "…" : " wallet"}</span>
          </button>
          {error ? (
            <span className="mt-1 max-w-[12rem] text-right font-mono text-[10px] leading-tight text-[var(--color-danger)]">
              {error}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)]">
          <span className="flex items-center gap-2 px-3 py-1.5 font-mono text-xs text-[var(--color-ink)]">
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 140deg, var(--color-acid), var(--color-ok), var(--color-warn), var(--color-acid))",
              }}
            />
            {truncateAddress(address)}
          </span>
          <button
            type="button"
            onClick={() => disconnect()}
            title="Disconnect"
            aria-label="Disconnect"
            className="border-l border-[var(--color-hairline-hi)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-danger)] focus:outline-none focus-visible:text-[var(--color-danger)]"
          >
            <span className="hidden sm:inline">Disconnect</span>
            <span className="sm:hidden">✕</span>
          </button>
        </div>
      )}
    </div>
  );
}
