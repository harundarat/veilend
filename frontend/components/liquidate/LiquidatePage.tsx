"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { ConfirmModal } from "@/components/shell/ConfirmModal";
import { CheckIcon, CopyIcon } from "@/components/shell/icons";
import {
  ADDRESSES,
  GRACE_PERIOD_SECONDS,
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
  vaultAbi,
  type VaultLoan,
} from "@/lib/contracts";
import { formatToken, truncateAddress } from "@/lib/format";
import { DISCOVERY_UNAVAILABLE } from "@/lib/positions/discover";
import {
  LIQUIDATE_STATUS_META,
  isLiquidateActionable,
  isLiquidateEligible,
  liquidateAction,
  liquidateUiStatus,
  type LiquidateUiStatus,
} from "@/lib/positions/hydrate";
import { useHydrateVaultLoans, useVaultLoanIds } from "@/lib/positions/use-vault-loans";
import { useNow } from "@/lib/use-now";
import { useWalletUi } from "@/lib/use-wallet-ui";
import { useWriteTx } from "@/lib/use-write-tx";

type Filter = "all" | "eligible" | "liquidated";
type PendingKind = "liquidate" | "withdraw";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "eligible", label: "Eligible now" },
  { key: "liquidated", label: "Already liquidated" },
];

function relativeDeadline(deadlineMs: number, now: number) {
  if (now <= 0 || deadlineMs <= 0) return { text: "—", overdue: false };
  const diff = deadlineMs - now;
  if (diff <= 0) return { text: "Overdue", overdue: true };
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return { text: `in ${d}d ${h % 24}h`, overdue: false };
  if (h > 0) return { text: `in ${h}h ${m % 60}m`, overdue: false };
  if (m > 0) return { text: `in ${m}m`, overdue: false };
  return { text: `in ${Math.floor(diff / 1000)}s`, overdue: false };
}

function deadlineMsOf(loan: VaultLoan) {
  if (loan.defaultDeadline <= BigInt(0)) return 0;
  return Number(loan.defaultDeadline) * 1000;
}

function dateFmt(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionCopy(status: LiquidateUiStatus) {
  const action = liquidateAction(status);
  if (action === "liquidate") {
    return "The NFT has been in the vault since lock. liquidate() unlocks the hook and marks the loan liquidated. It does not pull the NFT from the borrower. Anyone may call it after defaultDeadline. A second transaction withdraws the seized liquidity.";
  }
  if (action === "withdraw") {
    return "This loan is already liquidated. withdrawSeizedLiquidity() burns the position NFT and takes the underlying token pair into the vault. Not an auction and not a partial liquidation.";
  }
  if (action === "closed") {
    return "No vault actions remain. The position was liquidated and seized liquidity has been withdrawn.";
  }
  return "This loan is still inside the repay window (now ≤ defaultDeadline). Liquidate is unavailable until the deadline passes.";
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-hairline)] py-2.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
        {label}
      </span>
      <span className="min-w-0 font-mono text-sm text-[var(--color-ink)]">{children}</span>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
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
    <button
      type="button"
      onClick={copy}
      title="Copy borrower address"
      className="flex min-w-0 items-center gap-2 text-left font-mono text-xs text-[var(--color-ink)] transition-colors hover:text-[var(--color-acid)]"
    >
      <span className="truncate tabular-nums">{address}</span>
      {copied ? (
        <CheckIcon className="size-3.5 shrink-0 text-[var(--color-ok)]" />
      ) : (
        <CopyIcon className="size-3.5 shrink-0 opacity-70" />
      )}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin ${className ?? ""}`}
      fill="none"
      aria-hidden="true"
    >
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

function TableSkeleton() {
  return (
    <div className="overflow-hidden border border-[var(--color-hairline)]" aria-hidden="true">
      <div className="hidden h-10 border-b border-[var(--color-hairline)] bg-[var(--color-panel-hi)] md:block" />
      <div className="h-16 animate-pulse border-b border-[var(--color-hairline)] bg-[var(--color-panel)]" />
      <div className="h-16 animate-pulse border-b border-[var(--color-hairline)] bg-[var(--color-panel)]" />
      <div className="h-16 animate-pulse border-b border-[var(--color-hairline)] bg-[var(--color-panel)]" />
      <div className="h-16 animate-pulse bg-[var(--color-panel)]" />
    </div>
  );
}

function EmptyLoans() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center border border-dashed border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-10 text-center">
      <p className="font-mono text-sm text-[var(--color-ink)]">No loans past due.</p>
      <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-dim)]">
        Demo GRACE_PERIOD is {Math.floor(GRACE_PERIOD_SECONDS / 60)} minutes.
      </p>
    </div>
  );
}

function ActionChip({
  status,
  canWrite,
}: {
  status: LiquidateUiStatus;
  canWrite: boolean;
}) {
  const meta = LIQUIDATE_STATUS_META[status];
  const live = isLiquidateActionable(status);
  const disabled = live && !canWrite;
  return (
    <span
      className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
        disabled ? "opacity-40" : ""
      }`}
      style={{
        borderColor: live && !disabled ? meta.color : "var(--color-hairline-hi)",
        color: live && !disabled ? meta.color : "var(--color-ink-faint)",
      }}
    >
      {meta.label}
    </span>
  );
}

function ActionButton({
  status,
  canWrite,
  walletState,
  pending,
  relText,
  onLiquidate,
  onWithdraw,
}: {
  status: LiquidateUiStatus;
  canWrite: boolean;
  walletState: ReturnType<typeof useWalletUi>["state"];
  pending: PendingKind | null;
  relText: string;
  onLiquidate: () => void;
  onWithdraw: () => void;
}) {
  const action = liquidateAction(status);
  const busy = pending !== null;
  const needWallet = !canWrite && (action === "liquidate" || action === "withdraw");
  const gate =
    walletState === "disconnected" || walletState === "wrong-network"
      ? "Connect wallet on Sepolia to liquidate."
      : null;

  if (action === "closed") {
    return (
      <button
        type="button"
        disabled
        className="w-full cursor-not-allowed border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-faint)] opacity-60"
      >
        Closed
      </button>
    );
  }

  if (action === "ineligible") {
    return (
      <button
        type="button"
        disabled
        title="Loan is not past its defaultDeadline yet"
        className="w-full cursor-not-allowed border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-faint)] opacity-60"
      >
        Not eligible — {relText}
      </button>
    );
  }

  if (action === "withdraw") {
    return (
      <div className="flex flex-col gap-2">
        {needWallet && gate ? (
          <p className="font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">{gate}</p>
        ) : null}
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy || !canWrite}
          className="w-full border border-[var(--color-warn)] bg-[var(--color-warn)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending === "withdraw" ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Spinner className="size-4" />
              Withdraw
            </span>
          ) : (
            "Withdraw"
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {needWallet && gate ? (
        <p className="font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">{gate}</p>
      ) : null}
      <button
        type="button"
        onClick={onLiquidate}
        disabled={busy || !canWrite}
        className="w-full border border-[var(--color-danger)] bg-[var(--color-danger)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-danger-dim)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === "liquidate" ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner className="size-4" />
            Liquidate
          </span>
        ) : (
          "Liquidate"
        )}
      </button>
    </div>
  );
}

export function LiquidatePage({ positionId }: { positionId?: string }) {
  const extraId = positionId?.trim() && /^\d+$/.test(positionId.trim()) ? positionId.trim() : undefined;
  const chainId = useChainId();
  const { state, address } = useWalletUi();
  const now = useNow();
  const runTx = useWriteTx();
  const queryClient = useQueryClient();
  const canWrite = state === "connected" && Boolean(address);

  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(extraId ?? null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<PendingKind | null>(null);

  const extraIds = useMemo(() => (extraId ? [extraId] : []), [extraId]);
  const discovered = useVaultLoanIds({ chainId, extraIds });
  const hydrateKey = discovered.tokenIds.join(",");
  const hydrateIds = useMemo(
    () => (hydrateKey ? hydrateKey.split(",").map((id) => BigInt(id)) : []),
    [hydrateKey],
  );
  const hydrated = useHydrateVaultLoans({
    tokenIds: hydrateIds,
    enabled: hydrateIds.length > 0,
  });

  const gridLoading =
    discovered.isLoading ||
    (hydrated.isLoading && hydrated.rows.length === 0 && hydrateIds.length > 0);

  const filtered = useMemo(() => {
    return hydrated.rows.filter((row) => {
      const status = liquidateUiStatus(row.loan, row.owner, now);
      if (!status) return false;
      if (filter === "eligible") return isLiquidateActionable(status);
      if (filter === "liquidated") return status === "withdrawn";
      return true;
    });
  }, [hydrated.rows, filter, now]);

  const selectedRow = useMemo(
    () => hydrated.rows.find((row) => row.tokenId.toString() === selected) ?? null,
    [hydrated.rows, selected],
  );

  const run = async (kind: PendingKind, loan: VaultLoan) => {
    if (!canWrite) return;
    setPending(kind);
    setConfirming(false);
    try {
      await runTx(kind === "liquidate" ? "Liquidate" : "Withdraw liquidity", {
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: kind === "liquidate" ? "liquidate" : "withdrawSeizedLiquidity",
        args: [loan.positionId],
      });
      await Promise.all([
        hydrated.refetch(),
        queryClient.invalidateQueries({ queryKey: ["veilend-vault-loan-ids"] }),
      ]);
    } finally {
      setPending(null);
    }
  };

  const selectedStatus = selectedRow
    ? (liquidateUiStatus(selectedRow.loan, selectedRow.owner, now) ?? "active")
    : null;
  const selectedDeadlineMs = selectedRow ? deadlineMsOf(selectedRow.loan) : 0;
  const selectedRel =
    selectedDeadlineMs > 0 ? relativeDeadline(selectedDeadlineMs, now) : { text: "—", overdue: false };

  return (
    <div className="pb-24 pt-12">
      <header className="mb-8 max-w-3xl">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Liquidate
        </span>
        <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Close overdue loans
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          After <code className="text-[var(--color-ink)]">defaultDeadline</code>, the position NFT
          has already been sitting in the vault since it was locked. Liquidating does not seize an
          NFT from the borrower&apos;s wallet — it simply withdraws the underlying liquidity. Anyone
          can trigger it; no borrower permission is required.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`border px-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
              filter === item.key
                ? "border-[var(--color-acid)] bg-[var(--color-acid)] text-[var(--color-ground)]"
                : "border-[var(--color-hairline-hi)] text-[var(--color-ink-dim)] hover:border-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          {gridLoading ? (
            <TableSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyLoans />
          ) : (
            <div className="overflow-hidden border border-[var(--color-hairline)]">
              <div className="hidden grid-cols-[1fr_1.2fr_1fr_1.1fr_auto] gap-4 border-b border-[var(--color-hairline)] bg-[var(--color-panel-hi)] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-[var(--color-ink-faint)] md:grid">
                <span>positionId</span>
                <span>Borrower</span>
                <span>principal</span>
                <span>Deadline</span>
                <span className="text-right">Action</span>
              </div>
              {filtered.map((row) => {
                const status = liquidateUiStatus(row.loan, row.owner, now) ?? "active";
                const deadlineMs = deadlineMsOf(row.loan);
                const closed = status === "withdrawn";
                const rel =
                  !closed && deadlineMs > 0
                    ? relativeDeadline(deadlineMs, now)
                    : { text: "—", overdue: false };
                const id = row.tokenId.toString();
                const active = selected === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelected(id);
                      setConfirming(false);
                    }}
                    className={`grid w-full grid-cols-2 gap-x-4 gap-y-2 border-b border-[var(--color-hairline)] px-4 py-4 text-left transition-colors last:border-b-0 md:grid-cols-[1fr_1.2fr_1fr_1.1fr_auto] md:items-center ${
                      active
                        ? "bg-[var(--color-panel-hi)]"
                        : "bg-[var(--color-panel)] hover:bg-[var(--color-panel-hi)]"
                    }`}
                  >
                    <span className="font-mono text-sm text-[var(--color-ink)]">#{id}</span>
                    <span className="font-mono text-xs text-[var(--color-ink-dim)]">
                      {truncateAddress(row.loan.borrower)}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-[var(--color-ink)]">
                      {formatToken(row.loan.principal, LOAN_TOKEN_DECIMALS)}
                    </span>
                    <span
                      className={`font-mono text-xs ${
                        rel.overdue && !closed
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-ink-dim)]"
                      }`}
                    >
                      {rel.text}
                    </span>
                    <span className="col-span-2 mt-1 flex items-center justify-end gap-3 md:col-span-1 md:mt-0">
                      <ActionChip status={status} canWrite={canWrite} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {discovered.unavailable ? (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
              {DISCOVERY_UNAVAILABLE}
            </p>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-[84px] lg:self-start">
          {!selected ? (
            <div className="border border-dashed border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-8 text-center">
              <p className="font-mono text-sm text-[var(--color-ink-dim)]">
                Select a loan in the table.
              </p>
            </div>
          ) : gridLoading ? (
            <div className="h-80 animate-pulse border border-[var(--color-hairline)] bg-[var(--color-panel)]" />
          ) : selectedRow && selectedStatus ? (
            <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
                  #{selectedRow.tokenId.toString()}
                </h2>
                <span
                  className="font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: LIQUIDATE_STATUS_META[selectedStatus].color }}
                >
                  {LIQUIDATE_STATUS_META[selectedStatus].label}
                </span>
              </div>
              <DetailRow label="Borrower">
                <CopyAddress address={selectedRow.loan.borrower} />
              </DetailRow>
              <DetailRow label="principal">
                <span className="tabular-nums">
                  {formatToken(selectedRow.loan.principal, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
                </span>
              </DetailRow>
              <DetailRow label="defaultDeadline">
                <span
                  className={`text-right ${
                    selectedRel.overdue && liquidateAction(selectedStatus) !== "closed"
                      ? "text-[var(--color-danger)]"
                      : ""
                  }`}
                >
                  {selectedDeadlineMs > 0 ? (
                    <>
                      <span className="block tabular-nums">{dateFmt(selectedDeadlineMs)}</span>
                      <span className="block font-mono text-[11px] text-[var(--color-ink-dim)]">
                        {selectedRel.text}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </DetailRow>
              <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                {actionCopy(selectedStatus)}
              </p>
              <div className="mt-5">
                <ActionButton
                  status={selectedStatus}
                  canWrite={canWrite}
                  walletState={state}
                  pending={pending}
                  relText={selectedRel.text}
                  onLiquidate={() => setConfirming(true)}
                  onWithdraw={() => void run("withdraw", selectedRow.loan)}
                />
              </div>
            </section>
          ) : (
            <div className="border border-dashed border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-8 text-center">
              <p className="font-mono text-sm text-[var(--color-ink-dim)]">
                No loan for this position ID
              </p>
              <p className="mt-2 font-mono text-[11px] text-[var(--color-ink-faint)]">
                #{selected} is not on the liquidate list. The table is unchanged.
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirming && Boolean(selectedRow) && isLiquidateEligible(selectedRow?.loan, now)}
        title={
          selectedRow
            ? `Liquidate position #${selectedRow.tokenId.toString()}`
            : "Liquidate"
        }
        amountLabel="principal at risk"
        amount={
          selectedRow
            ? `${formatToken(selectedRow.loan.principal, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`
            : undefined
        }
        confirmLabel="Confirm liquidate"
        danger
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!selectedRow) return;
          void run("liquidate", selectedRow.loan);
        }}
      >
        All-or-nothing — this withdraws the full seized liquidity in one transaction. Not an
        auction, not a partial liquidation.
      </ConfirmModal>
    </div>
  );
}
