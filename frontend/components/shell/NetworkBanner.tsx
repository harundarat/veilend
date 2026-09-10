"use client";

import { useWalletUi } from "@/lib/use-wallet-ui";
import { AlertIcon } from "./icons";

export function NetworkBanner() {
  const { state, switchNetwork, isSwitching } = useWalletUi();
  if (state !== "wrong-network") return null;

  return (
    <div className="border-b border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_14%,var(--color-ground))]">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5">
        <span className="flex items-center gap-2 font-mono text-xs text-[var(--color-danger)]">
          <AlertIcon className="size-4" />
          Wrong network — switch to Sepolia / Anvil
        </span>
        <button
          type="button"
          onClick={switchNetwork}
          disabled={isSwitching}
          className="ml-auto border border-[var(--color-danger)] px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)] hover:text-[var(--color-ground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-ground)] disabled:opacity-60"
        >
          {isSwitching ? "Switching…" : "Switch network"}
        </button>
      </div>
    </div>
  );
}
