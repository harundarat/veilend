"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Address, zeroAddress } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useChainId, usePublicClient, useReadContracts } from "wagmi";
import { ConfirmModal } from "@/components/shell/ConfirmModal";
import { AlertIcon, ExternalIcon } from "@/components/shell/icons";
import {
  ADDRESSES,
  GRACE_PERIOD_SECONDS,
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
  VAULT_DEPLOY_BLOCK,
  erc20Abi,
  erc721Abi,
  repayAmountOf,
  vaultAbi,
  vaultEventsAbi,
  type VaultLoan,
} from "@/lib/contracts";
import {
  explorerTxUrl,
  formatBps,
  formatToken,
  truncateAddress,
} from "@/lib/format";
import { LoanLanding, LookupForm } from "@/components/loan/LoanLanding";
import {
  asLoan,
  hasLoan,
  loanUiStatus,
  LOAN_STATUS_META,
  sameAddress,
  type LoanUiStatus,
} from "@/lib/positions/hydrate";
import { useNow } from "@/lib/use-now";
import { useWalletUi } from "@/lib/use-wallet-ui";
import { useWriteTx } from "@/lib/use-write-tx";

type PendingKind = "approve-stable" | "repay";

type TimelineItem = {
  key: string;
  label: string;
  detail: string;
  txHash: string | null;
  at: number | null;
  done: boolean;
};

type StampedLog = {
  hash: string;
  at: number;
};

type LoanLogs = {
  locked?: StampedLog;
  report?: StampedLog;
  repaid?: StampedLog;
  liquidated?: StampedLog;
  seized?: StampedLog;
};



function vaultEvent(name: string) {
  const item = vaultEventsAbi.find((entry) => entry.type === "event" && entry.name === name);
  if (!item || item.type !== "event") {
    throw new Error(`missing vault event ${name}`);
  }
  return item;
}

const POSITION_LOCKED = vaultEvent("PositionLocked");
const CREDIT_REPORT = vaultEvent("CreditReportSubmitted");
const LOAN_REPAID = vaultEvent("LoanRepaid");
const LOAN_LIQUIDATED = vaultEvent("LoanLiquidated");
const SEIZED_WITHDRAWN = vaultEvent("SeizedLiquidityWithdrawn");

function dateFmt(ms: number) {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function gracePeriodLabel(seconds: number) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  return `${seconds} seconds`;
}

function StatusBadge({ status }: { status: LoanUiStatus }) {
  const meta = LOAN_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-xs uppercase tracking-widest"
      style={{ borderColor: meta.color, color: meta.color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
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

function Countdown({ deadlineMs }: { deadlineMs: number }) {
  const now = useNow();
  const remaining = deadlineMs - now;
  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[var(--color-danger)]">
        <AlertIcon className="size-3.5" /> Past due
      </span>
    );
  }
  const d = Math.floor(remaining / 86_400_000);
  const h = Math.floor((remaining % 86_400_000) / 3_600_000);
  const m = Math.floor((remaining % 3_600_000) / 60_000);
  const s = Math.floor((remaining % 60_000) / 1000);
  return (
    <span className="tabular-nums text-[var(--color-ink)]">
      {d}d {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[var(--color-panel)] p-5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
        {label}
      </span>
      <p
        className={`mt-2 font-mono text-xl font-bold tabular-nums tracking-tight ${
          accent ? "text-[var(--color-acid)]" : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-1 font-mono text-[11px] text-[var(--color-ink-faint)]">{sub}</p>
      ) : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="pb-24 pt-12">{children}</div>;
}

function LoadingState({ id }: { id: string }) {
  return (
    <Shell>
      <div className="flex min-h-[52vh] flex-col items-center justify-center gap-4">
        <Spinner className="size-8" />
        <p className="font-mono text-sm text-[var(--color-ink-dim)]">Loading loan #{id}…</p>
      </div>
    </Shell>
  );
}

function NotFoundState({ id }: { id: string }) {
  return (
    <Shell>
      <div className="mx-auto flex min-h-[52vh] max-w-md flex-col items-center justify-center text-center">
        <AlertIcon className="size-8 text-[var(--color-danger)]" />
        <h1 className="mt-4 font-mono text-2xl font-bold tracking-tight text-[var(--color-ink)]">
          Loan not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          No loan found for position #{id}. Check the position ID or start a new loan from Borrow.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/loan"
            className="border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-dim)]"
          >
            Look up another
          </Link>
          <Link
            href="/app"
            className="border border-[var(--color-acid)] bg-[var(--color-acid)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)]"
          >
            Go to Borrow
          </Link>
        </div>
        <div className="mt-8 w-full text-left">
          <LookupForm />
        </div>
      </div>
    </Shell>
  );
}

function buildTimeline(loan: VaultLoan, logs: LoanLogs | undefined): TimelineItem[] {
  const lockedDone =
    Boolean(logs?.locked) || loan.locked || loan.active || loan.repaid || loan.liquidated;
  const reportDone =
    Boolean(logs?.report) ||
    loan.active ||
    loan.repaid ||
    loan.liquidated ||
    loan.ltvBps > BigInt(0);
  const closedDone = Boolean(logs?.repaid || logs?.liquidated) || loan.repaid || loan.liquidated;

  const closedLabel = loan.repaid
    ? "Repaid"
    : loan.liquidated
      ? logs?.seized
        ? "Liquidated → Liquidity withdrawn"
        : "Liquidated"
      : "Loan settlement";
  const closedDetail = loan.repaid
    ? "Flat interest paid — NFT returned to borrower"
    : loan.liquidated
      ? logs?.seized
        ? "Past default deadline — seized collateral withdrawn"
        : "Past default deadline — awaiting liquidity claim by liquidator"
      : "Awaiting borrower repayment before default deadline";

  return [
    {
      key: "locked",
      label: "Position locked",
      detail: "LP NFT transferred to LendingVault as collateral",
      txHash: logs?.locked?.hash ?? null,
      at: logs?.locked?.at ?? null,
      done: lockedDone,
    },
    {
      key: "report",
      label: "Credit assessment completed",
      detail: "Chainlink CRE evaluated risk in TEE and finalized terms (LTV, APR, expiry)",
      txHash: logs?.report?.hash ?? null,
      at: logs?.report?.at ?? null,
      done: reportDone,
    },
    {
      key: "disbursed",
      label: "Principal disbursed",
      detail: "Loan principal transferred to borrower wallet",
      txHash: logs?.report?.hash ?? null,
      at: logs?.report?.at ?? null,
      done: reportDone,
    },
    {
      key: "closed",
      label: closedLabel,
      detail: closedDetail,
      txHash: logs?.repaid?.hash ?? logs?.liquidated?.hash ?? null,
      at: logs?.repaid?.at ?? logs?.liquidated?.at ?? null,
      done: closedDone,
    },
  ];
}

function Timeline({ items, chainId }: { items: TimelineItem[]; chainId: number }) {
  return (
    <div className="flex flex-col">
      {items.map((event, index) => {
        const done = event.done;
        const last = index === items.length - 1;
        const href = event.txHash ? explorerTxUrl(event.txHash, chainId) : undefined;
        return (
          <div key={event.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last ? (
              <span
                className={`absolute top-5 bottom-0 left-[7px] w-px ${
                  done ? "bg-[var(--color-acid-dim)]" : "bg-[var(--color-hairline)]"
                }`}
              />
            ) : null}
            <span
              className={`mt-1 size-3.5 shrink-0 rounded-full border-2 ${
                done
                  ? "border-[var(--color-acid)] bg-[var(--color-acid)]"
                  : "border-[var(--color-hairline-hi)] bg-[var(--color-panel)]"
              }`}
            />
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p
                  className={`font-mono text-sm ${
                    done ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"
                  }`}
                >
                  {index + 1}. {event.label}
                </p>
                {event.at ? (
                  <span className="font-mono text-[11px] text-[var(--color-ink-dim)]">
                    {dateFmt(event.at)}
                  </span>
                ) : done ? null : (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-faint)]">
                    Pending
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-dim)]">
                {event.detail}
              </p>
              {event.txHash ? (
                href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-acid)]"
                  >
                    {truncateAddress(event.txHash)}
                    <ExternalIcon className="size-3" />
                  </a>
                ) : (
                  <span className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--color-ink-dim)]">
                    {truncateAddress(event.txHash)}
                  </span>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RepayStepper({
  stableApproved,
  pending,
}: {
  stableApproved: boolean;
  pending: PendingKind | null;
}) {
  const approveDone = stableApproved || pending === "repay";
  const approveCurrent = pending === "approve-stable";
  const repayCurrent = pending === "repay";
  const items = [
    {
      key: "approve",
      label: `Approve ${LOAN_TOKEN_SYMBOL}`,
      done: approveDone,
      current: approveCurrent,
    },
    {
      key: "repay",
      label: "Repay loan",
      done: false,
      current: repayCurrent,
    },
  ];

  return (
    <ol className="mt-4 flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center gap-2.5">
          <span
            className={`size-3.5 shrink-0 rounded-full border-2 ${
              item.done
                ? "border-[var(--color-acid)] bg-[var(--color-acid)]"
                : item.current
                  ? "border-[var(--color-acid)] bg-[var(--color-panel)]"
                  : "border-[var(--color-hairline-hi)] bg-[var(--color-panel)]"
            }`}
          />
          <span
            className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest ${
              item.done || item.current
                ? "text-[var(--color-ink)]"
                : "text-[var(--color-ink-faint)]"
            }`}
          >
            {item.current ? <Spinner className="size-3" /> : null}
            {index + 1}. {item.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ActionPanel({
  loan,
  status,
  pastDue,
  canWrite,
  isBorrower,
  connected,
  stableApproved,
  pending,
  repayAmount,
  onRepay,
}: {
  loan: VaultLoan;
  status: LoanUiStatus;
  pastDue: boolean;
  canWrite: boolean;
  isBorrower: boolean;
  connected: boolean;
  stableApproved: boolean;
  pending: PendingKind | null;
  repayAmount: bigint;
  onRepay: () => void;
}) {
  if (status === "repaid" || status === "liquidated") {
    return (
      <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
          Loan closed
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          {status === "repaid"
            ? "This loan was fully repaid with flat interest. The position NFT has been returned to the borrower wallet and LP fees can now be collected directly from the position."
            : "This loan exceeded its default deadline and was liquidated. The position NFT has been burned and seized liquidity reclaimed by the vault."}
        </p>
        <button
          type="button"
          disabled
          className="mt-5 w-full cursor-not-allowed border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-faint)] opacity-60"
        >
          No actions available
        </button>
      </section>
    );
  }

  if (status === "locked") {
    return (
      <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
          Awaiting Credit Assessment
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          Your loan terms are being assessed privately via Chainlink CRE in a secure enclave (TEE). A relayer writes
          the result on-chain automatically. Repayment becomes available once funds are disbursed.
        </p>
        <button
          type="button"
          disabled
          className="mt-5 flex w-full items-center justify-center gap-2 border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-faint)] opacity-60"
        >
          <Spinner className="size-3.5" />
          Awaiting disbursement…
        </button>
      </section>
    );
  }

  if (pastDue) {
    return (
      <section className="border-2 border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_7%,var(--color-panel))] p-6">
        <div className="flex items-center gap-2">
          <AlertIcon className="size-4 text-[var(--color-danger)]" />
          <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
            Past due
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          The repayment window and grace period have ended. This loan is now defaulted and eligible for liquidation by any participant.
        </p>
        <Link
          href={`/liquidate?id=${loan.positionId.toString()}`}
          className="mt-5 flex w-full items-center justify-center gap-2 border border-[var(--color-danger)] bg-[var(--color-danger)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-danger-dim)]"
        >
          Go to Liquidate
        </Link>
      </section>
    );
  }

  if (!isBorrower) {
    return (
      <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
          Repay
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-dim)]">
          {connected
            ? `This loan belongs to borrower ${truncateAddress(loan.borrower)}. Connect or switch to the borrower wallet to make a repayment.`
            : "Connect the borrower wallet to manage or repay this loan."}
        </p>
        <button
          type="button"
          disabled
          title="Connected wallet is not the borrower"
          className="mt-5 w-full cursor-not-allowed border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-faint)] opacity-60"
        >
          Repay unavailable
        </button>
      </section>
    );
  }

  return (
    <section className="border border-[var(--color-hairline-hi)] bg-[var(--color-panel)] p-6">
      <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">Repay loan</h2>
      <div className="mt-4 flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-3">
        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
          Total repayment
        </span>
        <span className="font-mono text-xl font-bold tabular-nums text-[var(--color-ink)]">
          {formatToken(repayAmount, LOAN_TOKEN_DECIMALS)}{" "}
          <span className="text-xs font-normal text-[var(--color-ink-dim)]">
            {LOAN_TOKEN_SYMBOL}
          </span>
        </span>
      </div>
      <RepayStepper stableApproved={stableApproved} pending={pending} />
      <button
        type="button"
        onClick={onRepay}
        disabled={!canWrite || pending !== null}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? <Spinner className="size-4" /> : null}
        {pending === "approve-stable"
          ? `Approving ${LOAN_TOKEN_SYMBOL}…`
          : pending === "repay"
            ? "Repaying…"
            : "Repay loan"}
      </button>
      {pending || !stableApproved ? (
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
          {pending
            ? "Check your wallet to sign."
            : `Two wallet signatures: approve ${LOAN_TOKEN_SYMBOL}, then repay.`}
        </p>
      ) : null}
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
        Accrued LP fees remain with your position and are not deducted during repayment. Once the NFT returns to your wallet, fees can be claimed directly from the position.
      </p>
    </section>
  );
}

const LOG_CHUNK = BigInt(1000);

function useLoanLogs(tokenId: bigint | null, enabled: boolean) {
  const publicClient = usePublicClient();
  const chainId = useChainId();

  return useQuery({
    queryKey: ["veilend-loan-events", chainId, tokenId?.toString()],
    enabled: enabled && tokenId != null && Boolean(publicClient),
    queryFn: async (): Promise<LoanLogs> => {
      const empty: LoanLogs = {};
      if (!publicClient || tokenId == null) return empty;
      const startBlock = chainId === sepolia.id ? VAULT_DEPLOY_BLOCK : BigInt(0);
      const args = { positionId: tokenId };
      try {
        const latest = await publicClient.getBlockNumber();
        const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
        let from = startBlock;
        while (from <= latest) {
          const end = from + LOG_CHUNK - BigInt(1);
          const toBlock = end < latest ? end : latest;
          ranges.push({ fromBlock: from, toBlock });
          from = toBlock + BigInt(1);
        }

        const locked: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
        const report: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
        const repaid: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
        const liquidated: Awaited<ReturnType<typeof publicClient.getLogs>> = [];
        const seized: Awaited<ReturnType<typeof publicClient.getLogs>> = [];

        for (const range of ranges) {
          const [lockedBatch, reportBatch, repaidBatch, liquidatedBatch, seizedBatch] =
            await Promise.all([
              publicClient.getLogs({
                address: ADDRESSES.vault,
                event: POSITION_LOCKED,
                args,
                ...range,
              }),
              publicClient.getLogs({
                address: ADDRESSES.vault,
                event: CREDIT_REPORT,
                args,
                ...range,
              }),
              publicClient.getLogs({
                address: ADDRESSES.vault,
                event: LOAN_REPAID,
                args,
                ...range,
              }),
              publicClient.getLogs({
                address: ADDRESSES.vault,
                event: LOAN_LIQUIDATED,
                args,
                ...range,
              }),
              publicClient.getLogs({
                address: ADDRESSES.vault,
                event: SEIZED_WITHDRAWN,
                args,
                ...range,
              }),
            ]);
          locked.push(...lockedBatch);
          report.push(...reportBatch);
          repaid.push(...repaidBatch);
          liquidated.push(...liquidatedBatch);
          seized.push(...seizedBatch);
        }

        const uniqueBlocks = [
          ...new Set(
            [...locked, ...report, ...repaid, ...liquidated, ...seized]
              .map((log) => log.blockNumber)
              .filter((block): block is bigint => block != null)
              .map((block) => block.toString()),
          ),
        ];
        const blocks = await Promise.all(
          uniqueBlocks.map((value) => publicClient.getBlock({ blockNumber: BigInt(value) })),
        );
        const atByBlock = new Map(
          uniqueBlocks.map((value, index) => [value, Number(blocks[index].timestamp) * 1000]),
        );
        const stamp = (
          log:
            | {
                transactionHash?: `0x${string}` | null;
                blockNumber?: bigint | null;
              }
            | undefined,
        ): StampedLog | undefined => {
          if (!log?.transactionHash || log.blockNumber == null) return undefined;
          const at = atByBlock.get(log.blockNumber.toString()) ?? 0;
          return { hash: log.transactionHash, at };
        };
        return {
          locked: stamp(locked.at(-1)),
          report: stamp(report.at(-1)),
          repaid: stamp(repaid.at(-1)),
          liquidated: stamp(liquidated.at(-1)),
          seized: stamp(seized.at(-1)),
        };
      } catch {
        return empty;
      }
    },
  });
}

function LoanDetail({ rawId }: { rawId: string }) {
  const validId = /^\d+$/.test(rawId);
  const tokenId = validId ? BigInt(rawId) : null;

  const { address } = useAccount();
  const chainId = useChainId();
  const { state } = useWalletUi();
  const runTx = useWriteTx();
  const queryClient = useQueryClient();
  const now = useNow();

  const connected = state === "connected";
  const canWrite = connected && Boolean(address);

  const [pending, setPending] = useState<PendingKind | null>(null);
  const [repayConfirm, setRepayConfirm] = useState(false);
  const [approveConfirmed, setApproveConfirmed] = useState(false);
  const flowLock = useRef(false);

  const readsEnabled = tokenId != null;
  const ownerKey = address ?? zeroAddress;
  const contracts = useMemo(
    () => [
      {
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "getLoan" as const,
        args: [tokenId ?? BigInt(0)] as const,
      },
      {
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "ownerOf" as const,
        args: [tokenId ?? BigInt(0)] as const,
      },
      {
        address: ADDRESSES.vdusd,
        abi: erc20Abi,
        functionName: "allowance" as const,
        args: [ownerKey, ADDRESSES.vault] as const,
      },
    ],
    [ownerKey, tokenId],
  );
  const positionQuery = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: readsEnabled,
      refetchInterval: (query) => {
        const loan = asLoan(query.state.data?.[0]?.result);
        if (loan?.locked && !loan.active && !loan.repaid && !loan.liquidated) return 4000;
        return false;
      },
    },
  });

  const loan =
    positionQuery.data?.[0]?.status === "success"
      ? asLoan(positionQuery.data[0].result)
      : undefined;
  const owner =
    positionQuery.data?.[1]?.status === "success"
      ? (positionQuery.data[1].result as Address)
      : undefined;
  const allowance =
    positionQuery.data?.[2]?.status === "success"
      ? (positionQuery.data[2].result as bigint)
      : BigInt(0);

  const found = hasLoan(loan);
  const status = loanUiStatus(loan);
  const logsQuery = useLoanLogs(tokenId, found);
  const timeline = useMemo(
    () => (loan && found ? buildTimeline(loan, logsQuery.data) : []),
    [loan, found, logsQuery.data],
  );

  if (!validId) return <NotFoundState id={rawId} />;
  if (positionQuery.isPending && !positionQuery.data) {
    return <LoadingState id={rawId} />;
  }
  if (!loan || !found || !status) return <NotFoundState id={rawId} />;

  const repayAmount = repayAmountOf(loan);
  const stableApproved =
    approveConfirmed || (repayAmount > BigInt(0) && allowance >= repayAmount);
  const deadlineMs =
    loan.defaultDeadline > BigInt(0) ? Number(loan.defaultDeadline) * 1000 : 0;
  const expiryMs = loan.expiry > BigInt(0) ? Number(loan.expiry) * 1000 : 0;
  const pastDue = status === "active" && deadlineMs > 0 && now > deadlineMs;
  const isBorrower = connected && sameAddress(address, loan.borrower);
  const inVault = sameAddress(owner, ADDRESSES.vault);
  const awaitingTerms = status === "locked";
  const hasTerms = status === "active" || status === "repaid" || status === "liquidated";

  const repayFlow = async () => {
    if (!canWrite || tokenId == null || repayAmount === BigInt(0) || flowLock.current) return;
    flowLock.current = true;
    try {
      if (!stableApproved) {
        setPending("approve-stable");
        await runTx("Approve stable", {
          address: ADDRESSES.vdusd,
          abi: erc20Abi,
          functionName: "approve",
          args: [ADDRESSES.vault, repayAmount],
        });
        setApproveConfirmed(true);
        await queryClient.invalidateQueries();
      }
      setPending("repay");
      await runTx("Repay loan", {
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "repayLoan",
        args: [tokenId],
      });
      await queryClient.invalidateQueries();
    } catch {
      // useWriteTx already toasts reject/revert
    } finally {
      flowLock.current = false;
      setPending(null);
    }
  };

  const nftOwnerLabel = !owner
    ? status === "liquidated"
      ? "Burned / withdrawn"
      : "—"
    : inVault
      ? "LendingVault"
      : sameAddress(owner, loan.borrower)
        ? "Borrower wallet"
        : "External wallet";

  return (
    <Shell>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
            Loan detail
          </span>
          <h1 className="mt-2 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]">
            Position #{loan.positionId.toString()}
          </h1>
          <div className="mt-4 flex flex-col gap-1.5 font-mono text-xs text-[var(--color-ink-dim)]">
            <span>
              Borrower{" "}
              <span className="text-[var(--color-ink)]">{truncateAddress(loan.borrower)}</span>
            </span>
            <span>
              Current NFT owner{" "}
              <span className={inVault ? "text-[var(--color-warn)]" : "text-[var(--color-ink)]"}>
                {nftOwnerLabel}
                {owner ? ` (${truncateAddress(owner)})` : ""}
              </span>
            </span>
          </div>
        </div>
        <StatusBadge status={status} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-8">
          <section>
            <div className="mb-4 flex items-baseline gap-3 border-b border-[var(--color-hairline)] pb-3">
              <span className="font-mono text-xs tracking-[0.35em] text-[var(--color-acid)]">
                01
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink-dim)]">
                On-chain values
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--color-hairline)] bg-[var(--color-hairline)] sm:grid-cols-3">
              <Metric
                label="Collateral value"
                value={
                  hasTerms
                    ? formatToken(loan.collateralValue, LOAN_TOKEN_DECIMALS)
                    : awaitingTerms
                      ? "—"
                      : formatToken(loan.collateralValue, LOAN_TOKEN_DECIMALS)
                }
                sub={LOAN_TOKEN_SYMBOL}
              />
              <Metric
                label="LTV"
                value={hasTerms ? formatBps(loan.ltvBps) : "—"}
                sub={hasTerms ? `${loan.ltvBps.toString()} bps` : "awaiting CRE report"}
              />
              <Metric
                label="APR"
                value={hasTerms ? formatBps(loan.aprBps) : "—"}
                sub={hasTerms ? `${loan.aprBps.toString()} bps` : "awaiting CRE report"}
              />
              <Metric
                label="Principal"
                value={
                  hasTerms ? formatToken(loan.principal, LOAN_TOKEN_DECIMALS) : "—"
                }
                sub={LOAN_TOKEN_SYMBOL}
                accent
              />
              <Metric
                label="Repay amount"
                value={hasTerms ? formatToken(repayAmount, LOAN_TOKEN_DECIMALS) : "—"}
                sub={
                  hasTerms
                    ? `includes ${formatBps(loan.aprBps)} flat interest`
                    : "principal + flat interest"
                }
              />
              {status === "active" ? (
                <Metric
                  label="Countdown"
                  value={
                    deadlineMs > 0 ? (
                      <Countdown deadlineMs={deadlineMs} />
                    ) : (
                      "—"
                    )
                  }
                  sub={
                    deadlineMs <= 0
                      ? "to default deadline"
                      : now > deadlineMs
                        ? "past default deadline"
                        : expiryMs > 0 && now > expiryMs
                          ? "grace period active — repay now"
                          : "to default deadline"
                  }
                />
              ) : status === "locked" ? (
                <Metric
                  label="Countdown"
                  value="—"
                  sub="starts after terms"
                />
              ) : (
                <Metric
                  label="Outcome"
                  value={status === "repaid" ? "Repaid" : "Liquidated"}
                  sub={
                    status === "repaid"
                      ? logsQuery.data?.repaid?.at
                        ? dateFmt(logsQuery.data.repaid.at)
                        : "NFT returned to borrower"
                      : logsQuery.data?.liquidated?.at
                        ? dateFmt(logsQuery.data.liquidated.at)
                        : "past default deadline"
                  }
                />
              )}
            </div>
            <div className="mt-px grid grid-cols-1 gap-px overflow-hidden border border-t-0 border-[var(--color-hairline)] bg-[var(--color-hairline)] sm:grid-cols-2">
              <Metric
                label="Expiry"
                value={
                  <span className="text-sm">{expiryMs > 0 ? dateFmt(expiryMs) : "—"}</span>
                }
              />
              <Metric
                label="Default deadline"
                value={
                  <span className="text-sm">{deadlineMs > 0 ? dateFmt(deadlineMs) : "—"}</span>
                }
                sub={`Includes ${gracePeriodLabel(GRACE_PERIOD_SECONDS)} grace period after expiry`}
              />
            </div>
            <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-[var(--color-ink-faint)]">
              <span className="size-1.5 rounded-full bg-[var(--color-acid)]" />
              Confidential underwriting: Credit terms are calculated privately inside a Chainlink CRE TEE and never published on-chain.
            </p>
          </section>

          <section>
            <div className="mb-4 flex items-baseline gap-3 border-b border-[var(--color-hairline)] pb-3">
              <span className="font-mono text-xs tracking-[0.35em] text-[var(--color-acid)]">
                02
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-ink-dim)]">
                Event timeline
              </span>
            </div>
            <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
              <Timeline items={timeline} chainId={chainId} />
            </div>
          </section>
        </div>

        <div className="lg:sticky lg:top-[84px] lg:self-start">
          <ActionPanel
            loan={loan}
            status={status}
            pastDue={pastDue}
            canWrite={canWrite}
            isBorrower={Boolean(isBorrower)}
            connected={connected}
            stableApproved={stableApproved}
            pending={pending}
            repayAmount={repayAmount}
            onRepay={() => setRepayConfirm(true)}
          />
        </div>
      </div>

      <ConfirmModal
        open={repayConfirm}
        title="Repay loan"
        amountLabel="Total repayment"
        amount={`${formatToken(repayAmount, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`}
        confirmLabel="Confirm repay"
        onCancel={() => setRepayConfirm(false)}
        onConfirm={() => {
          setRepayConfirm(false);
          void repayFlow();
        }}
      >
        {stableApproved
          ? "Repay principal plus flat interest to close the loan and return your position NFT to your wallet."
          : `You will sign two transactions: first to approve ${LOAN_TOKEN_SYMBOL} spending, then to repay. Check your wallet after each prompt. Repayment returns your position NFT to your wallet.`}
      </ConfirmModal>
    </Shell>
  );
}

export function LoanPage({ positionId }: { positionId?: string }) {
  const rawId = positionId?.trim() ?? "";
  const { address } = useAccount();
  if (!rawId) return <LoanLanding />;
  return <LoanDetail key={`${address ?? ""}:${rawId}`} rawId={rawId} />;
}
