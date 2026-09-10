"use client";

import { useState } from "react";
import { CONTRACTS, README_URL, REPO_URL } from "@/lib/contracts";
import { truncateAddress } from "@/lib/format";
import { CheckIcon, CopyIcon, ExternalIcon } from "./icons";

function ContractRow({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      /* clipboard unavailable in some sandboxes */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-hairline)] py-2.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
        {label}
      </span>
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label} address`}
        className="flex items-center gap-2 font-mono text-xs text-[var(--color-ink)] transition-colors hover:text-[var(--color-acid)] focus:outline-none focus-visible:text-[var(--color-acid)]"
      >
        <span className="tabular-nums">{truncateAddress(address)}</span>
        {copied ? (
          <CheckIcon className="size-3.5 text-[var(--color-ok)]" />
        ) : (
          <CopyIcon className="size-3.5 opacity-70" />
        )}
      </button>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--color-hairline)] bg-[var(--color-panel)]">
      <div className="mx-auto grid max-w-[1280px] gap-x-12 gap-y-10 px-6 py-10 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-5">
          <span className="font-mono text-[15px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink)]">
            Veilend
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-[var(--color-ink-dim)]">
            Borrow against Uniswap v4 LP positions. A stronger risk profile earns a better LTV,
            scored inside a Chainlink CRE confidential workflow.
          </p>
          <div className="flex items-center gap-3">
            {[
              { label: "GitHub", href: REPO_URL },
              { label: "README", href: README_URL },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-[var(--color-hairline-hi)] px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:border-[var(--color-ink-dim)] hover:text-[var(--color-ink)] focus:outline-none focus-visible:text-[var(--color-ink)]"
              >
                {link.label}
                <ExternalIcon className="size-3" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-1 font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
            Contract addresses — Sepolia
          </h3>
          <div>
            {CONTRACTS.map((contract) => (
              <ContractRow key={contract.label} {...contract} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-hairline)]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-1 px-6 py-4">
          <p className="font-mono text-[10px] leading-relaxed tracking-wide text-[var(--color-ink-faint)]">
            Demo pool only. The NFT is custodied by the vault for the loan duration. No oracle —
            price is 1:1. CRE is accessed via a relayer, not directly from the browser. Repay
            interest is flat. LP fees accrue until the loan is closed.
          </p>
        </div>
      </div>
    </footer>
  );
}
