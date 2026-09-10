"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { LoanCard, LoanCardSkeleton } from "@/components/loan/LoanCard";
import { SAMPLE_POSITION_ID } from "@/lib/contracts";
import { DISCOVERY_UNAVAILABLE } from "@/lib/positions/discover";
import { isWalletLoan } from "@/lib/positions/hydrate";
import { useHydratePositions } from "@/lib/positions/use-hydrate";
import { useDiscoveredPositions } from "@/lib/positions/use-positions";
import { useWalletUi } from "@/lib/use-wallet-ui";

function LookupForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const go = () => {
    if (!id) return;
    router.push(`/loan/${id}`);
  };

  return (
    <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
      <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
        Look up any position ID
      </h2>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
        Inspect on-chain numbers and the transaction trail for a loan that is not in the list.
      </p>
      <div className="mt-5 flex gap-3">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={id}
          onChange={(event) => setId(event.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(event) => event.key === "Enter" && go()}
          placeholder={`e.g. ${SAMPLE_POSITION_ID}`}
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
    </section>
  );
}

export function LoanLanding() {
  const router = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const { state } = useWalletUi();
  const connected = state === "connected";
  const wrongNetwork = state === "wrong-network";
  const canDiscover = Boolean(address) && (connected || wrongNetwork);

  const discovered = useDiscoveredPositions({
    wallet: address,
    chainId,
  });
  const hydrateKey = discovered.tokenIds.join(",");
  const hydrateIds = useMemo(
    () => (hydrateKey ? hydrateKey.split(",").map((id) => BigInt(id)) : []),
    [hydrateKey],
  );
  const hydrated = useHydratePositions({
    tokenIds: hydrateIds,
    wallet: address,
    enabled: canDiscover,
  });

  const loans = useMemo(
    () => hydrated.positions.filter((position) => isWalletLoan(position.loan, address)),
    [hydrated.positions, address],
  );
  const gridLoading =
    canDiscover &&
    (discovered.isLoading || (hydrated.isLoading && loans.length === 0));

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
          Inspect on-chain numbers and the transaction trail for a single loan.
        </p>
      </header>

      <section className="mb-8">
        {!canDiscover ? (
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
        ) : loans.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {loans.map((position) => (
              <LoanCard
                key={position.tokenId.toString()}
                position={position}
                onView={() => router.push(`/loan/${position.tokenId.toString()}`)}
              />
            ))}
          </div>
        ) : (
          <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
            <p className="font-mono text-sm text-[var(--color-ink)]">
              No active loan in this wallet.
            </p>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
              <Link href="/app" className="underline hover:text-[var(--color-acid)]">
                Lock a position on Borrow
              </Link>
            </p>
            {discovered.unavailable ? (
              <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
                {DISCOVERY_UNAVAILABLE}
              </p>
            ) : null}
          </div>
        )}
        {loans.length > 0 && discovered.unavailable ? (
          <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
            {DISCOVERY_UNAVAILABLE}
          </p>
        ) : null}
      </section>

      <LookupForm />
    </div>
  );
}
