"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  ADDRESSES,
  FAUCET_AMOUNT,
  erc20Abi,
} from "@/lib/contracts";
import { useWriteTx } from "@/lib/use-write-tx";
import { useWalletUi } from "@/lib/use-wallet-ui";

const TOKENS = [
  { symbol: "vUSD", note: "token0 of the demo pool", address: ADDRESSES.vusd },
  { symbol: "vEUR", note: "token1 of the demo pool", address: ADDRESSES.veur },
  { symbol: "vdUSD", note: "mock stablecoin for repay", address: ADDRESSES.vdusd },
] as const;

export function FaucetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address } = useAccount();
  const { state } = useWalletUi();
  const runTx = useWriteTx();
  const queryClient = useQueryClient();
  const [minting, setMinting] = useState<string | null>(null);
  const canMint = state === "connected" && Boolean(address);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mint = async (symbol: (typeof TOKENS)[number]["symbol"], token: `0x${string}`) => {
    if (!address || !canMint) return;
    setMinting(symbol);
    try {
      await runTx(`Mint ${symbol}`, {
        address: token,
        abi: erc20Abi,
        functionName: "mint",
        args: [address, FAUCET_AMOUNT],
      });
      await queryClient.invalidateQueries();
    } catch {
      /* toast already updated */
    } finally {
      setMinting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mock token faucet"
    >
      <div
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ground)_78%,transparent)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md border border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-acid)]">
              Demo faucet
            </span>
            <h2 className="mt-1 font-mono text-lg font-bold tracking-tight text-[var(--color-ink)]">
              Mint mock tokens
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-sm text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col divide-y divide-[var(--color-hairline)] border border-[var(--color-hairline)]">
          {TOKENS.map((token) => (
            <div key={token.symbol} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-mono text-sm text-[var(--color-ink)]">{token.symbol}</p>
                <p className="font-mono text-[11px] text-[var(--color-ink-faint)]">{token.note}</p>
              </div>
              <button
                type="button"
                onClick={() => mint(token.symbol, token.address)}
                disabled={!canMint || minting === token.symbol}
                className="border border-[var(--color-acid)] bg-[var(--color-acid)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:opacity-50"
              >
                {minting === token.symbol ? "Minting…" : "Mint 1,000"}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          Demo only. These mock tokens have a public mint for testing on Ethereum Sepolia. Demo-pool
          LP positions are minted via the repo script, not here.
        </p>
      </div>
    </div>
  );
}
