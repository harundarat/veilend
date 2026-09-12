"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  InventoryCard,
  InventoryCardSkeleton,
} from "@/components/positions/InventoryCard";
import { DISCOVERY_UNAVAILABLE, unionTokenIds } from "@/lib/positions/discover";
import { useExtraPositionIds } from "@/lib/positions/extra-ids";
import { type InventoryTab } from "@/lib/positions/inventory";
import { useHydrateInventory } from "@/lib/positions/use-inventory";
import { useDiscoveredPositions } from "@/lib/positions/use-positions";
import { useWalletLoanEventIds } from "@/lib/positions/use-vault-loans";
import { useWalletUi } from "@/lib/use-wallet-ui";

const TABS: { key: InventoryTab; label: string }[] = [
  { key: "wallet", label: "In wallet" },
  { key: "vault", label: "In vault (active loan)" },
  { key: "closed", label: "Closed" },
];

function EmptyState({ tab }: { tab: InventoryTab }) {
  if (tab === "wallet") {
    return (
      <div className="flex min-h-[32vh] flex-col items-center justify-center border border-dashed border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-10 text-center">
        <p className="font-mono text-sm text-[var(--color-ink)]">
          No positions found in this wallet.{" "}
          <Link href="/app" className="underline hover:text-[var(--color-acid)]">
            Open Borrow
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[32vh] flex-col items-center justify-center border border-dashed border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-10 text-center">
      <p className="font-mono text-sm text-[var(--color-ink)]">
        {tab === "vault"
          ? "No active loan in the vault for this wallet."
          : "No closed loans for this wallet."}
      </p>
    </div>
  );
}

export function PositionsPage({ positionId }: { positionId?: string }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { state } = useWalletUi();
  const connected = state === "connected";
  const extraId = positionId?.trim() && /^\d+$/.test(positionId.trim()) ? positionId.trim() : undefined;
  const remembered = useExtraPositionIds(address);
  const extraIds = useMemo(
    () => unionTokenIds(remembered, extraId ? [extraId] : []),
    [remembered, extraId],
  );

  const discovered = useDiscoveredPositions({
    wallet: address,
    chainId,
    extraIds,
  });
  const eventsEnabled =
    connected && Boolean(address) && discovered.unavailable;
  const events = useWalletLoanEventIds({
    wallet: address,
    chainId,
    enabled: eventsEnabled,
  });

  const hydrateKey = unionTokenIds(discovered.tokenIds, events.tokenIds).join(",");
  const hydrateIds = useMemo(
    () => (hydrateKey ? hydrateKey.split(",").map((id) => BigInt(id)) : []),
    [hydrateKey],
  );
  const hydrated = useHydrateInventory({
    tokenIds: hydrateIds,
    wallet: address,
    enabled: connected && Boolean(address),
  });

  const items = hydrated.items;
  const counts: Record<InventoryTab, number> = {
    wallet: items.filter((item) => item.tab === "wallet").length,
    vault: items.filter((item) => item.tab === "vault").length,
    closed: items.filter((item) => item.tab === "closed").length,
  };

  const [manualTab, setManualTab] = useState<InventoryTab | null>(null);
  const linked = extraId
    ? items.find((item) => item.tokenId.toString() === extraId)
    : undefined;
  const tab = manualTab ?? linked?.tab ?? "wallet";
  const visible = items.filter((item) => item.tab === tab);

  const gridLoading =
    connected &&
    (discovered.isLoading ||
      events.isLoading ||
      (hydrated.isLoading && items.length === 0));

  if (state === "disconnected") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Positions
        </span>
        <h1 className="mt-4 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]">
          Connect a wallet to see your positions
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-ink-dim)]">
          View all LP positions owned or escrowed by your wallet — in one place.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-12">
      <header className="mb-8">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Positions
        </span>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Your positions
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-dim)]">
          Everything owned or locked by the connected wallet. Closed is loan history — a repaid
          position returns to In wallet and can be locked again.
        </p>
      </header>

      {state === "wrong-network" ? (
        <p className="mb-8 font-mono text-[11px] leading-relaxed text-[var(--color-warn)]">
          Switch to Sepolia to load your positions.
        </p>
      ) : null}

      <div className="mb-8 flex flex-wrap gap-2 border-b border-[var(--color-hairline)]">
        {TABS.map((entry) => (
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

      {gridLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <InventoryCardSkeleton />
          <InventoryCardSkeleton />
          <InventoryCardSkeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <InventoryCard
              key={`${item.tab}-${item.tokenId.toString()}`}
              item={item}
              highlighted={Boolean(extraId) && item.tokenId.toString() === extraId}
            />
          ))}
        </div>
      )}

      {extraId && connected && !gridLoading && !linked ? (
        <p className="mt-6 font-mono text-[11px] text-[var(--color-ink-dim)]">
          Position #{extraId} not found for this wallet.
        </p>
      ) : null}

      {connected && discovered.unavailable && chainId === sepolia.id ? (
        <p className="mt-6 font-mono text-[11px] text-[var(--color-warn)]">
          {DISCOVERY_UNAVAILABLE}
        </p>
      ) : null}
    </div>
  );
}
