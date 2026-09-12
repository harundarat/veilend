"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useNow } from "@/lib/use-now";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, zeroAddress } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
} from "wagmi";
import { ConfirmModal } from "@/components/shell/ConfirmModal";
import { AlertIcon, ExternalIcon } from "@/components/shell/icons";
import { PositionCard, PositionCardSkeleton } from "@/components/borrow/PositionCard";
import {
  ADDRESSES,
  LOAN_TOKEN_DECIMALS,
  LOAN_TOKEN_SYMBOL,
  RELAYER_TIMEOUT_MS,
  SAMPLE_POSITION_ID,
  erc20Abi,
  erc721Abi,
  isDemoPool,
  positionManagerAbi,
  repayAmountOf,
  vaultAbi,
} from "@/lib/contracts";
import {
  explorerTxUrl,
  formatBps,
  formatLiquidity,
  formatToken,
  truncateAddress,
} from "@/lib/format";
import { DISCOVERY_UNAVAILABLE, unionTokenIds } from "@/lib/positions/discover";
import { rememberPositionId, useExtraPositionIds } from "@/lib/positions/extra-ids";
import {
  asLoan,
  asPoolKey,
  derivePhase,
  sameAddress,
  type Phase,
} from "@/lib/positions/hydrate";
import { useHydratePositions } from "@/lib/positions/use-hydrate";
import { useDiscoveredPositions } from "@/lib/positions/use-positions";
import { useWalletUi } from "@/lib/use-wallet-ui";
import { useWriteTx } from "@/lib/use-write-tx";

type PendingKind = "approve" | "lock" | "approve-stable" | "repay";

const STATUS_META: Record<
  "idle" | "locked" | "active" | "repaid" | "liquidated",
  { label: string; color: string }
> = {
  idle: { label: "Idle", color: "var(--color-ink-dim)" },
  locked: { label: "Locked — Assessing terms", color: "var(--color-warn)" },
  active: { label: "Active", color: "var(--color-acid)" },
  repaid: { label: "Repaid", color: "var(--color-ok)" },
  liquidated: { label: "Liquidated", color: "var(--color-danger)" },
};

function StatusBadge({ phase }: { phase: Phase | null }) {
  const key: keyof typeof STATUS_META =
    phase === "locked"
      ? "locked"
      : phase === "active"
        ? "active"
        : phase === "repaid"
          ? "repaid"
          : phase === "liquidated"
            ? "liquidated"
            : "idle";
  const meta = STATUS_META[key];
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

function RelayerTimeoutNotice() {
  const [ticks, setTicks] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTicks((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (dismissed || ticks * 1000 < RELAYER_TIMEOUT_MS) return null;

  return (
    <div className="mb-8 flex items-start gap-3 border border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-4 py-3">
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" />
      <div className="font-mono text-xs leading-relaxed text-[var(--color-danger)]">
        Relayer timed out after ~30–60s. Please ensure the relayer service is running, then try locking again.
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-auto font-mono text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
      >
        ✕
      </button>
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--color-hairline)] py-2.5 last:border-b-0">
      <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
        {label}
      </span>
      <span className="font-mono text-sm text-[var(--color-ink)]">{children}</span>
    </div>
  );
}

function Countdown({ deadlineMs }: { deadlineMs: number }) {
  const now = useNow();
  const remaining = Math.max(0, deadlineMs - now);
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

export function BorrowPage() {
  const searchParams = useSearchParams();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { state } = useWalletUi();
  const runTx = useWriteTx();
  const queryClient = useQueryClient();

  const connected = state === "connected";
  const wrongNetwork = state === "wrong-network";
  const canWrite = connected && Boolean(address);

  const [positionInput, setPositionInput] = useState(() => searchParams.get("id") ?? "");
  const [submittedId, setSubmittedId] = useState<bigint | null>(null);
  const [pending, setPending] = useState<PendingKind | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [repayConfirm, setRepayConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [txFailed, setTxFailed] = useState(false);

  const tokenId = submittedId ?? BigInt(0);
  const readsEnabled = submittedId !== null && Boolean(address) && (connected || wrongNetwork);
  const extraIds = useExtraPositionIds(address);
  const discovered = useDiscoveredPositions({ wallet: address, chainId, extraIds });
  const hydrateKey = unionTokenIds(
    discovered.tokenIds,
    submittedId != null ? [submittedId.toString()] : [],
  ).join(",");
  const hydrateIds = useMemo(
    () => (hydrateKey ? hydrateKey.split(",").map((id) => BigInt(id)) : []),
    [hydrateKey],
  );
  const hydrated = useHydratePositions({
    tokenIds: hydrateIds,
    wallet: address,
    enabled: Boolean(address) && (connected || wrongNetwork),
  });
  const cards = hydrated.positions;
  const gridLoading = discovered.isLoading || (hydrated.isLoading && cards.length === 0);

  const positionQuery = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [tokenId],
      },
      {
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "getApproved",
        args: [tokenId],
      },
      {
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "isApprovedForAll",
        args: [address ?? zeroAddress, ADDRESSES.vault],
      },
      {
        address: ADDRESSES.positionManager,
        abi: positionManagerAbi,
        functionName: "getPositionLiquidity",
        args: [tokenId],
      },
      {
        address: ADDRESSES.positionManager,
        abi: positionManagerAbi,
        functionName: "getPoolAndPositionInfo",
        args: [tokenId],
      },
      {
        address: ADDRESSES.vault,
        abi: vaultAbi,
        functionName: "getLoan",
        args: [tokenId],
      },
      {
        address: ADDRESSES.vdusd,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? zeroAddress, ADDRESSES.vault],
      },
    ],
    query: {
      enabled: readsEnabled,
      refetchInterval: (query) => {
        const loan = asLoan(query.state.data?.[5]?.result);
        if (loan?.locked && !loan.active && !loan.repaid && !loan.liquidated) return 4000;
        return false;
      },
    },
  });

  const balanceQuery = useReadContract({
    address: ADDRESSES.vdusd,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && (connected || wrongNetwork) },
  });

  const owner =
    positionQuery.data?.[0]?.status === "success"
      ? (positionQuery.data[0].result as Address)
      : undefined;
  const approvedSpender =
    positionQuery.data?.[1]?.status === "success"
      ? (positionQuery.data[1].result as Address)
      : undefined;
  const approvedForAll =
    positionQuery.data?.[2]?.status === "success"
      ? Boolean(positionQuery.data[2].result)
      : false;
  const liquidity =
    positionQuery.data?.[3]?.status === "success"
      ? (positionQuery.data[3].result as bigint)
      : undefined;
  const poolKey =
    positionQuery.data?.[4]?.status === "success"
      ? asPoolKey(positionQuery.data[4].result)
      : undefined;
  const loan =
    positionQuery.data?.[5]?.status === "success"
      ? asLoan(positionQuery.data[5].result)
      : undefined;
  const allowance =
    positionQuery.data?.[6]?.status === "success"
      ? (positionQuery.data[6].result as bigint)
      : BigInt(0);

  const nftApproved =
    sameAddress(approvedSpender, ADDRESSES.vault) || approvedForAll;
  const demoOk = poolKey ? isDemoPool(poolKey) : false;
  const validPhase =
    submittedId !== null && demoOk
      ? derivePhase(loan, owner, address, nftApproved)
      : null;

  const findFailed =
    submittedId !== null &&
    positionQuery.isFetched &&
    !positionQuery.isFetching &&
    validPhase === null;

  const showReverted = !dismissed && (findFailed || txFailed);

  const inVault = sameAddress(owner, ADDRESSES.vault);
  const repayAmount = loan ? repayAmountOf(loan) : BigInt(0);
  const stableApproved = repayAmount > BigInt(0) && allowance >= repayAmount;
  const hasTerms =
    validPhase === "active" ||
    validPhase === "repaid" ||
    validPhase === "liquidated";
  const deadlineMs =
    loan && loan.defaultDeadline > BigInt(0) ? Number(loan.defaultDeadline) * 1000 : null;
  const lastTxHref = lastTx ? explorerTxUrl(lastTx, chainId) : undefined;
  const balance = balanceQuery.data ?? BigInt(0);

  const resetFlow = () => {
    setSubmittedId(null);
    setPending(null);
    setLastTx(null);
    setDismissed(false);
    setTxFailed(false);
  };

  const findPosition = () => {
    const raw = positionInput.trim();
    if (!/^\d+$/.test(raw)) {
      setSubmittedId(BigInt(0));
      setDismissed(false);
      setTxFailed(false);
      return;
    }
    setDismissed(false);
    setTxFailed(false);
    setLastTx(null);
    const id = BigInt(raw);
    setSubmittedId(id);
    rememberId(id);
  };

  const run = async (kind: PendingKind, title: string, request: Parameters<typeof runTx>[1]) => {
    if (!canWrite) return;
    setPending(kind);
    setTxFailed(false);
    setDismissed(false);
    try {
      const hash = await runTx(title, request);
      setLastTx(hash);
      await queryClient.invalidateQueries();
      return hash;
    } catch {
      setTxFailed(true);
      return undefined;
    } finally {
      setPending(null);
    }
  };

  const rememberId = (id: bigint) => {
    if (!address) return;
    rememberPositionId(address, id.toString());
  };

  const selectPosition = (id: bigint) => {
    setPositionInput(id.toString());
    setSubmittedId(id);
    setDismissed(false);
    setTxFailed(false);
    rememberId(id);
  };

  const approveNft = (id = submittedId) => {
    if (id == null) return;
    return run("approve", "Approve NFT", {
      address: ADDRESSES.positionManager,
      abi: erc721Abi,
      functionName: "approve",
      args: [ADDRESSES.vault, id],
    });
  };

  const lockPosition = async (id = submittedId) => {
    if (id == null) return;
    const hash = await run("lock", "Lock position", {
      address: ADDRESSES.vault,
      abi: vaultAbi,
      functionName: "lockPosition",
      args: [id],
    });
    if (hash) rememberId(id);
    return hash;
  };

  const lockAndRequest = async (id: bigint) => {
    if (!canWrite || !address || !publicClient) return;
    selectPosition(id);
    const [spender, forAll] = await Promise.all([
      publicClient.readContract({
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "getApproved",
        args: [id],
      }),
      publicClient.readContract({
        address: ADDRESSES.positionManager,
        abi: erc721Abi,
        functionName: "isApprovedForAll",
        args: [address, ADDRESSES.vault],
      }),
    ]);
    if (!sameAddress(spender, ADDRESSES.vault) && !forAll) {
      const approved = await approveNft(id);
      if (!approved) return;
    }
    await lockPosition(id);
  };

  const approveStable = () => {
    if (repayAmount === BigInt(0)) return;
    return run("approve-stable", "Approve stable", {
      address: ADDRESSES.vdusd,
      abi: erc20Abi,
      functionName: "approve",
      args: [ADDRESSES.vault, repayAmount],
    });
  };

  const repay = () => {
    if (submittedId == null) return;
    return run("repay", "Repay loan", {
      address: ADDRESSES.vault,
      abi: vaultAbi,
      functionName: "repayLoan",
      args: [submittedId],
    });
  };

  if (!connected && !wrongNetwork) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
          Borrow
        </span>
        <h1 className="mt-4 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)]">
          Connect a wallet to begin
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-ink-dim)]">
          Use the Connect wallet button in the header. Select an eligible LP position, approve it,
          and lock it to borrow against your liquidity.
        </p>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-acid)]">
            Borrow
          </span>
          <h1 className="mt-3 font-mono text-3xl font-bold tracking-tight text-[var(--color-ink)] md:text-4xl">
            Lock a position, borrow stablecoins
          </h1>
        </div>
        <div className="flex items-center gap-2 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-3 py-2 font-mono text-xs text-[var(--color-ink-dim)]">
          <span className="uppercase tracking-widest text-[var(--color-ink-faint)]">
            Stable balance
          </span>
          <span className="text-[var(--color-ink)]">
            {formatToken(balance, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
          </span>
        </div>
      </header>

      {showReverted ? (
        <div className="mb-8 flex items-start gap-3 border border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-4 py-3">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--color-danger)]" />
          <div className="font-mono text-xs leading-relaxed text-[var(--color-danger)]">
            {findFailed ? (
              <>
                Position not found or not eligible for borrowing. Try position ID{" "}
                {SAMPLE_POSITION_ID}.
              </>
            ) : (
              <>Transaction reverted or failed. Please try again.</>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              setTxFailed(false);
            }}
            className="ml-auto font-mono text-xs text-[var(--color-ink-dim)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </div>
      ) : null}

      {validPhase === "locked" ? <RelayerTimeoutNotice /> : null}

      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-8">
          <section>
            {gridLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <PositionCardSkeleton />
                <PositionCardSkeleton />
                <PositionCardSkeleton />
                <PositionCardSkeleton />
              </div>
            ) : cards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {cards.map((position) => (
                  <PositionCard
                    key={position.tokenId.toString()}
                    position={position}
                    selected={submittedId === position.tokenId}
                    pending={
                      pending === "approve" || pending === "lock"
                        ? submittedId === position.tokenId
                        : false
                    }
                    canWrite={canWrite}
                    onSelect={() => selectPosition(position.tokenId)}
                    onLock={() => void lockAndRequest(position.tokenId)}
                  />
                ))}
              </div>
            ) : (
              <div className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
                <p className="font-mono text-sm text-[var(--color-ink)]">
                  No eligible positions found in this wallet
                </p>
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                  Eligible demo-pool LP NFTs are minted outside this page.{" "}
                  <Link
                    href="/#how-it-works"
                    className="underline hover:text-[var(--color-acid)]"
                  >
                    How it works
                  </Link>
                </p>
                {discovered.unavailable ? (
                  <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
                    {DISCOVERY_UNAVAILABLE}
                  </p>
                ) : null}
              </div>
            )}
            {cards.length > 0 && discovered.unavailable ? (
              <p className="mt-3 font-mono text-[11px] text-[var(--color-warn)]">
                {DISCOVERY_UNAVAILABLE}
              </p>
            ) : null}
          </section>

          <details
            className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6"
            {...(searchParams.get("id") ? { open: true } : {})}
          >
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
              Don&apos;t see your position? Enter ID manually
            </summary>
            <label
              htmlFor="positionId"
              className="mt-4 block font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]"
            >
              Position ID
            </label>
            <div className="mt-4 flex gap-3">
              <input
                id="positionId"
                inputMode="numeric"
                pattern="[0-9]*"
                value={positionInput}
                disabled={submittedId !== null}
                onChange={(event) =>
                  setPositionInput(event.target.value.replace(/[^0-9]/g, ""))
                }
                onKeyDown={(event) =>
                  event.key === "Enter" && submittedId === null && findPosition()
                }
                placeholder={`e.g. ${SAMPLE_POSITION_ID}`}
                className="min-w-0 flex-1 border border-[var(--color-hairline-hi)] bg-[var(--color-ground)] px-3 py-2.5 font-mono text-sm text-[var(--color-ink)] tabular-nums outline-none transition-colors placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-acid)] disabled:opacity-50"
              />
              {submittedId === null ? (
                <button
                  type="button"
                  onClick={findPosition}
                  disabled={!positionInput.trim() || !canWrite}
                  className="border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-dim)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Find
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetFlow}
                  className="border border-[var(--color-hairline-hi)] px-5 py-2.5 font-mono text-xs uppercase tracking-wider text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-ink)]"
                >
                  Change
                </button>
              )}
            </div>
            {findFailed ? (
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--color-danger)]">
                No eligible demo-pool position for that ID. Try {SAMPLE_POSITION_ID}.
              </p>
            ) : (
              <p className="mt-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                Only positions from the Veilend demo pool are eligible.
              </p>
            )}
          </details>

          {validPhase ? (
            <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
                  Position #{submittedId?.toString()}
                </h2>
                <StatusBadge phase={validPhase} />
              </div>
              <DataRow label="Position Owner">
                <span className={inVault ? "text-[var(--color-warn)]" : "text-[var(--color-ink)]"}>
                  {inVault ? "Vault" : "Wallet"}{" "}
                  <span className="text-[var(--color-ink-dim)]">
                    ({truncateAddress(owner ?? "")})
                  </span>
                </span>
              </DataRow>
              <DataRow label="NFT approval">
                {validPhase === "found" ? (
                  <span className="text-[var(--color-ink-dim)]">Not approved</span>
                ) : (
                  <span className="text-[var(--color-ok)]">Approved → vault</span>
                )}
              </DataRow>
              <DataRow label="Size">
                <span className="tabular-nums">
                  {liquidity !== undefined ? formatLiquidity(liquidity) : "—"}
                </span>
              </DataRow>
              <DataRow label="Loan status">
                {validPhase === "found" || validPhase === "approved"
                  ? "No active loan"
                  : validPhase === "locked"
                    ? "Locked — awaiting terms"
                    : validPhase === "active"
                      ? "Active"
                      : validPhase === "liquidated"
                        ? "Liquidated"
                        : "Repaid"}
              </DataRow>
              {loan?.repaid && (validPhase === "found" || validPhase === "approved") ? (
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                  This position was repaid and returned to your wallet. Lock it again to request new terms.
                </p>
              ) : null}
            </section>
          ) : null}

          {validPhase ? (
            <Stepper
              phase={validPhase}
              pending={pending}
              canWrite={canWrite}
              onApprove={approveNft}
              onLock={lockPosition}
            />
          ) : null}

          {validPhase === "active" ? (
            <section className="border-2 border-[var(--color-danger-dim)] bg-[color-mix(in_srgb,var(--color-danger)_6%,var(--color-panel))] p-6">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[var(--color-danger)]" />
                <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
                  Repay
                </h2>
              </div>
              <div className="mt-4 flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-3">
                <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                  Repay Amount
                </span>
                <span className="font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
                  {formatToken(repayAmount, LOAN_TOKEN_DECIMALS)}{" "}
                  <span className="text-sm font-normal text-[var(--color-ink-dim)]">
                    {LOAN_TOKEN_SYMBOL}
                  </span>
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={approveStable}
                  disabled={!canWrite || stableApproved || pending === "approve-stable"}
                  title={stableApproved ? "Stablecoin already approved" : undefined}
                  className="inline-flex items-center gap-2 border border-[var(--color-hairline-hi)] bg-[var(--color-panel-hi)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)] transition-colors hover:border-[var(--color-ink-dim)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending === "approve-stable" && <Spinner className="size-4" />}
                  {stableApproved ? "Stable approved" : "Approve stable"}
                </button>
                <button
                  type="button"
                  onClick={() => setRepayConfirm(true)}
                  disabled={!canWrite || !stableApproved || pending === "repay"}
                  title={!stableApproved ? "Approve the stablecoin first" : undefined}
                  className="inline-flex items-center gap-2 border border-[var(--color-danger)] bg-[var(--color-danger)] px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-danger-dim)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending === "repay" && <Spinner className="size-4" />}
                  Repay
                </button>
              </div>
              <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                LP fees are not auto-collected. You can claim them once your position NFT is returned to your wallet.
              </p>
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-[84px] lg:self-start">
          <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
                Loan terms
              </h2>
              <div className="flex items-center gap-3">
                {submittedId != null &&
                (validPhase === "locked" ||
                  validPhase === "active" ||
                  validPhase === "repaid" ||
                  validPhase === "liquidated") ? (
                  <Link
                    href={`/loan/${submittedId.toString()}`}
                    className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)] transition-colors hover:text-[var(--color-acid)]"
                  >
                    Inspect loan
                  </Link>
                ) : null}
                <StatusBadge phase={validPhase} />
              </div>
            </div>

            {hasTerms && loan ? (
              <div>
                <DataRow label="LTV">{formatBps(loan.ltvBps)}</DataRow>
                <DataRow label="APR">{formatBps(loan.aprBps)}</DataRow>
                <DataRow label="Collateral value">
                  <span className="tabular-nums">
                    {formatToken(loan.collateralValue, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
                  </span>
                </DataRow>
                <DataRow label="Principal">
                  <span className="tabular-nums text-[var(--color-acid)]">
                    {formatToken(loan.principal, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
                  </span>
                </DataRow>
                <DataRow label="Repay amount">
                  <span className="tabular-nums">
                    {formatToken(repayAmount, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
                  </span>
                </DataRow>
                <DataRow label="Deadline">
                  {deadlineMs ? (
                    new Date(deadlineMs).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  ) : (
                    "—"
                  )}
                </DataRow>
                <DataRow label="Countdown">
                  {deadlineMs && validPhase === "active" ? (
                    <Countdown deadlineMs={deadlineMs} />
                  ) : (
                    <span className="text-[var(--color-ink-dim)]">Loan closed</span>
                  )}
                </DataRow>
                <p className="mt-4 font-mono text-[10px] leading-relaxed text-[var(--color-ink-faint)]">
                  Priced 1:1, no oracle. Only verified LTV, APR, and expiry leave the confidential enclave.
                </p>
              </div>
            ) : validPhase === "locked" ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <Spinner className="size-8" />
                <p className="font-mono text-sm text-[var(--color-ink)]">
                  Computing personal terms in confidential enclave…
                </p>
                <p className="font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                  A relayer triggers the confidential workflow. Polling on-chain for finalized terms automatically.
                </p>
              </div>
            ) : validPhase === "found" || validPhase === "approved" ? (
              <div>
                <DataRow label="Size">
                  <span className="tabular-nums">
                    {liquidity !== undefined ? formatLiquidity(liquidity) : "—"}
                  </span>
                </DataRow>
                <DataRow label="LTV">
                  <span className="text-[var(--color-ink-dim)]">Computed upon locking</span>
                </DataRow>
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                  {loan?.repaid
                    ? "Previous loan is closed. Lock again to request a new confidential term sheet."
                    : "On-chain preview only. Collateral value is computed by the vault once confidential loan terms are settled."}
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="font-mono text-sm text-[var(--color-ink-dim)]">No terms to display.</p>
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-faint)]">
                  Select a position and lock it to request custom loan terms.
                </p>
              </div>
            )}
          </section>

          <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
            <DataRow label="Borrower balance">
              <span className="tabular-nums">
                {formatToken(balance, LOAN_TOKEN_DECIMALS)} {LOAN_TOKEN_SYMBOL}
              </span>
            </DataRow>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-ink-dim)]">
                Latest tx
              </span>
              {lastTx ? (
                lastTxHref ? (
                  <a
                    href={lastTxHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-sm text-[var(--color-ink)] transition-colors hover:text-[var(--color-acid)]"
                  >
                    {truncateAddress(lastTx)}
                    <ExternalIcon className="size-3.5" />
                  </a>
                ) : (
                  <span className="font-mono text-sm text-[var(--color-ink)]">
                    {truncateAddress(lastTx)}
                  </span>
                )
              ) : (
                <span className="font-mono text-sm text-[var(--color-ink-faint)]">—</span>
              )}
            </div>
          </section>

          {validPhase === "repaid" ? (
            <section className="border border-[var(--color-ok)] bg-[color-mix(in_srgb,var(--color-ok)_8%,var(--color-panel))] p-6">
              <p className="font-mono text-sm text-[var(--color-ok)]">Loan repaid</p>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-dim)]">
                Your position NFT has been returned to your wallet. You can now collect accrued LP fees directly from the position.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <p className="mt-12 text-center font-mono text-[11px] text-[var(--color-ink-faint)]">
        Need the flow explained?{" "}
        <Link
          href="/#how-it-works"
          className="text-[var(--color-ink-dim)] underline hover:text-[var(--color-acid)]"
        >
          Read How it works
        </Link>
      </p>

      <ConfirmModal
        open={repayConfirm}
        title="Repay loan"
        amountLabel="Repay Amount"
        amount={`${formatToken(repayAmount, LOAN_TOKEN_DECIMALS)} ${LOAN_TOKEN_SYMBOL}`}
        confirmLabel="Confirm repay"
        danger
        onCancel={() => setRepayConfirm(false)}
        onConfirm={() => {
          setRepayConfirm(false);
          void repay();
        }}
      >
        Repay principal plus interest to close the loan and return your position NFT to your wallet.
      </ConfirmModal>
    </div>
  );
}

function Stepper({
  phase,
  pending,
  canWrite,
  onApprove,
  onLock,
}: {
  phase: Phase;
  pending: PendingKind | null;
  canWrite: boolean;
  onApprove: () => void;
  onLock: () => void;
}) {
  const order: Phase[] = ["found", "approved", "locked", "active"];
  const idx = order.indexOf(
    phase === "repaid" || phase === "liquidated" ? "active" : phase,
  );

  const stages = [
    {
      title: "Approve NFT",
      sub: "Authorize vault to hold position",
      done: idx > 0,
      current: phase === "found",
    },
    {
      title: "Lock position",
      sub: "Deposit position into vault",
      done: idx > 1,
      current: phase === "approved",
    },
    {
      title: "Awaiting confidential terms",
      sub: "Enclave evaluates credit profile",
      done: idx > 2,
      current: phase === "locked",
    },
    {
      title: "Loan active",
      sub: "Principal disbursed to wallet",
      done: phase === "active" || phase === "repaid" || phase === "liquidated",
      current: phase === "active",
    },
  ];

  return (
    <section className="border border-[var(--color-hairline)] bg-[var(--color-panel)] p-6">
      <h2 className="mb-5 font-mono text-sm uppercase tracking-widest text-[var(--color-ink)]">
        Flow
      </h2>
      <div className="flex flex-col">
        {stages.map((stage, i) => (
          <div key={stage.title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 ? (
              <span
                className={`absolute top-9 bottom-0 left-[15px] w-px ${
                  stage.done ? "bg-[var(--color-acid-dim)]" : "bg-[var(--color-hairline)]"
                }`}
              />
            ) : null}
            <div
              className={`flex size-8 shrink-0 items-center justify-center border font-mono text-xs ${
                stage.done
                  ? "border-[var(--color-acid)] bg-[var(--color-acid)] text-[var(--color-ground)]"
                  : stage.current
                    ? "border-[var(--color-acid)] text-[var(--color-acid)]"
                    : "border-[var(--color-hairline-hi)] text-[var(--color-ink-faint)]"
              }`}
            >
              {stage.done ? "✓" : i + 1}
            </div>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3 pt-0.5">
              <div>
                <p
                  className={`font-mono text-sm ${
                    stage.current || stage.done
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-ink-dim)]"
                  }`}
                >
                  {stage.title}
                </p>
                <p className="font-mono text-[11px] text-[var(--color-ink-faint)]">{stage.sub}</p>
              </div>

              {i === 0 && phase === "found" ? (
                <button
                  type="button"
                  onClick={onApprove}
                  disabled={!canWrite || pending === "approve"}
                  className="inline-flex items-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:opacity-60"
                >
                  {pending === "approve" && <Spinner className="size-3.5" />}
                  Approve NFT
                </button>
              ) : null}
              {i === 1 && phase === "approved" ? (
                <button
                  type="button"
                  onClick={onLock}
                  disabled={!canWrite || pending === "lock"}
                  className="inline-flex items-center gap-2 border border-[var(--color-acid)] bg-[var(--color-acid)] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-[var(--color-ground)] transition-colors hover:bg-[var(--color-acid-dim)] disabled:opacity-60"
                >
                  {pending === "lock" && <Spinner className="size-3.5" />}
                  Lock position
                </button>
              ) : null}
              {i === 2 && phase === "locked" ? (
                <span className="inline-flex items-center gap-2 font-mono text-xs text-[var(--color-warn)]">
                  <Spinner className="size-3.5" />
                  Polling…
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
