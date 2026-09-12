"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { LoanCard, LoanCardSkeleton } from "@/components/loan/LoanCard";
import { DISCOVERY_UNAVAILABLE, unionTokenIds } from "@/lib/positions/discover";
import { isWalletLoan, loanUiStatus, type LoanUiStatus } from "@/lib/positions/hydrate";
import { useHydratePositions } from "@/lib/positions/use-hydrate";
import { useDiscoveredPositions } from "@/lib/positions/use-positions";
import { useWalletLoanEventIds } from "@/lib/positions/use-vault-loans";
import { useWalletUi } from "@/lib/use-wallet-ui";

type LoanFilter = "active" | "closed";

const FILTERS: { key: LoanFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
];

function isActiveStatus(status: LoanUiStatus | null) {
  return status === "active" || status === "locked";
}

export function LookupForm({ collapsible = false }: { collapsible?: boolean }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [open, setOpen] = useState(!collapsible);
  const go = () => {
    if (!id) return;
    router.push(`/loan/${id}`);
  };
  const showForm = !collapsible || open;

  return (
    <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
            Look up any position ID
          </h2>
          <span className="font-mono text-xs text-[var(--color-ink-dim)]">
            {open ? "Hide" : "Show"}
          </span>
        </button>
      ) : (
        <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
          Look up any position ID
        </h2>
      )}
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
        Inspect on-chain numbers and the transaction trail for a loan that is not in the list.
      </p>
      {showForm ? (
        <div className="mt-5 flex gap-3">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={id}
            onChange={(event) => setId(event.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(event) => event.key === "Enter" && go()}
            placeholder="Enter a position ID"
            className="min-w-0 flex-1 border border-[var(--color-hairline-hi)] bg-[var(--color-ground)] px-3 py-2.5 font-mono text-sm tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-acid)]"
          />
          <button
            type="button"
            onClick={go}
            disabled={!id}
            className="border border-[var(--color-acid)] bg-[var(--color-acid)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:opacity-40"
          >
            View
          </button>
        </div>
      ) : null}
    </section>
  );
}

function EmptyLoans({
  filter,
  hasAny,
}: {
  filter: LoanFilter;
  hasAny: boolean;
}) {
  const title = !hasAny
    ? "No loans for this wallet."
    : filter === "active"
      ? "No active loans in this wallet."
      : "No closed loans in this wallet.";

  return (
    <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
      <p className="font-mono text-sm text-[var(--color-ink)]">{title}</p>
      {!hasAny ? (
        <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
          <Link href="/app" className="underline hover:text-[var(--color-acid)]">
            Start a loan on Borrow
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function LoanLanding() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const { state } = useWalletUi();
  const connected = state === "connected";
  const wrongNetwork = state === "wrong-network";

  const discovered = useDiscoveredPositions({
    wallet: address,
    chainId,
  });
  const events = useWalletLoanEventIds({
    wallet: address,
    chainId,
    enabled: connected && Boolean(address) && discovered.unavailable,
  });
  const hydrateKey = unionTokenIds(discovered.tokenIds, events.tokenIds).join(",");
  const hydrateIds = useMemo(
    () => (hydrateKey ? hydrateKey.split(",").map((id) => BigInt(id)) : []),
    [hydrateKey],
  );
  const hydrated = useHydratePositions({
    tokenIds: hydrateIds,
    wallet: address,
    enabled: connected && Boolean(address),
  });

  const loans = useMemo(
    () => hydrated.positions.filter((position) => isWalletLoan(position.loan, address)),
    [hydrated.positions, address],
  );
  const activeLoans = useMemo(
    () => loans.filter((position) => isActiveStatus(loanUiStatus(position.loan))),
    [loans],
  );
  const closedLoans = useMemo(
    () => loans.filter((position) => !isActiveStatus(loanUiStatus(position.loan))),
    [loans],
  );

  const [manualTab, setManualTab] = useState<LoanFilter | null>(null);
  const derivedTab: LoanFilter =
    activeLoans.length > 0 ? "active" : closedLoans.length > 0 ? "closed" : "active";
  const tab = manualTab ?? derivedTab;
  const visible = tab === "active" ? activeLoans : closedLoans;
  const counts: Record<LoanFilter, number> = {
    active: activeLoans.length,
    closed: closedLoans.length,
  };

  const gridLoading =
    connected &&
    (discovered.isLoading ||
      events.isLoading ||
      (hydrated.isLoading && loans.length === 0));
  const showFilters = connected && !gridLoading && loans.length > 0;

  return (
    <div className="pb-24 pt-12">
      <header className="mb-10">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Loan
        </span>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Your loans
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
          All your active and past loan positions in one place.
        </p>
      </header>

      {wrongNetwork ? (
        <p className="mb-8 font-mono text-[11px] leading-relaxed text-[var(--color-warn)]">
          Switch to Sepolia to load your loans.
        </p>
      ) : null}

      {showFilters ? (
        <div className="mb-8 flex flex-wrap gap-2 border-b border-[var(--color-hairline)]">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setManualTab(entry.key)}
              className={`relative -mb-px flex items-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-wider transition-colors ${
                tab === entry.key
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
              }`}
            >
              {entry.label}
              <span className="border border-[var(--color-hairline-hi)] px-1.5 py-px text-[10px] text-[var(--color-ink-faint)]">
                {counts[entry.key]}
              </span>
              {tab === entry.key ? (
                <span className="absolute bottom-0 left-0 h-px w-full bg-[var(--color-acid)]" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {wrongNetwork ? null : (
        <section className="mb-8">
          {!connected ? (
            <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
              <p className="font-mono text-sm text-[var(--color-ink)]">
                Connect a wallet to see your loans
              </p>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                Use the Connect wallet button in the header. You can still look up any position ID
                below.
              </p>
            </div>
          ) : gridLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <LoanCardSkeleton />
              <LoanCardSkeleton />
              <LoanCardSkeleton />
              <LoanCardSkeleton />
            </div>
          ) : visible.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((position) => (
                <LoanCard
                  key={position.tokenId.toString()}
                  position={position}
                  onView={() => router.push(`/loan/${position.tokenId.toString()}`)}
                />
              ))}
            </div>
          ) : (
            <EmptyLoans filter={tab} hasAny={loans.length > 0} />
          )}
          {connected && discovered.unavailable ? (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
              {DISCOVERY_UNAVAILABLE}
            </p>
          ) : null}
        </section>
      )}

      <LookupForm
        key={loans.length > 0 ? "has-loans" : "empty"}
        collapsible={loans.length > 0}
      />
    </div>
  );
}
