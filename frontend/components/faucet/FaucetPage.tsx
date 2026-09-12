"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { zeroAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { ADDRESSES, FAUCET_AMOUNT, erc20Abi } from "@/lib/contracts";
import { formatToken, truncateAddress } from "@/lib/format";
import { useWalletUi } from "@/lib/use-wallet-ui";
import { useWriteTx } from "@/lib/use-write-tx";

const TOKENS = [
  { symbol: "vUSD", note: "token0 of the demo pool", address: ADDRESSES.vusd },
  { symbol: "vEUR", note: "token1 of the demo pool", address: ADDRESSES.veur },
  { symbol: "vdUSD", note: "mock stablecoin for repay", address: ADDRESSES.vdusd },
] as const;

export function FaucetPage() {
  const { address } = useAccount();
  const { state } = useWalletUi();
  const runTx = useWriteTx();
  const queryClient = useQueryClient();
  const [minting, setMinting] = useState<string | null>(null);
  const canMint = state === "connected" && Boolean(address);
  const canRead = Boolean(address) && (state === "connected" || state === "wrong-network");

  const balances = useReadContracts({
    allowFailure: true,
    contracts: TOKENS.map((token) => ({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address ?? zeroAddress] as const,
    })),
    query: { enabled: canRead },
  });

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

  const gate =
    state === "disconnected"
      ? "Connect a wallet on Sepolia to mint."
      : state === "wrong-network"
        ? "Switch to Ethereum Sepolia to mint."
        : null;

  return (
    <div className="pb-24 pt-12">
      <header className="mb-10">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Faucet
        </span>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Mint mock tokens
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
          Demo tokens on Ethereum Sepolia for the Veilend pool and loan repayments. LP positions
          are minted via the repo script, not here.
        </p>
      </header>

      {gate ? (
        <div className="mb-8 border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
          <p className="font-mono text-sm text-[var(--color-ink)]">{gate}</p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
            Use the Connect wallet button in the header. You can still inspect the token list
            below.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {TOKENS.map((token, index) => {
          const result = balances.data?.[index];
          const balance =
            canRead && result?.status === "success" ? (result.result as bigint) : null;
          return (
            <article
              key={token.symbol}
              className="flex flex-col border border-[var(--color-hairline)] bg-[var(--color-panel)] p-5"
            >
              <p className="font-mono text-sm text-[var(--color-ink)]">{token.symbol}</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-faint)]">
                {token.note}
              </p>
              <p className="mt-3 font-mono text-[11px] tabular-nums text-[var(--color-ink-dim)]">
                {truncateAddress(token.address)}
              </p>
              <p className="mt-6 font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                Wallet balance
              </p>
              <p className="mt-1 font-mono text-lg tabular-nums text-[var(--color-ink)]">
                {balance === null ? "—" : formatToken(balance)}
              </p>
              <div className="mt-auto pt-5">
                <button
                  type="button"
                  onClick={() => mint(token.symbol, token.address)}
                  disabled={!canMint || minting === token.symbol}
                  className="w-full border border-[var(--color-acid)] bg-[var(--color-acid)] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:opacity-50"
                >
                  {minting === token.symbol ? "Minting…" : "Mint 1,000"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="mt-8 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        Demo only. These mock tokens have a public mint for testing on Ethereum Sepolia. Demo-pool
        LP positions are minted via the repo script, not here.
      </p>

      <p className="mt-12 text-center font-mono text-[11px] text-[var(--color-ink-faint)]">
        Ready to borrow?{" "}
        <Link href="/app" className="text-[var(--color-ink-dim)] underline hover:text-[var(--color-acid)]">
          Open Borrow
        </Link>
      </p>
    </div>
  );
}
