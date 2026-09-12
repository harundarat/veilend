"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { useReadContracts } from "wagmi";
import {
  ADDRESSES,
  erc721Abi,
  positionManagerAbi,
  vaultAbi,
} from "@/lib/contracts";
import { asLoan, asPoolKey } from "@/lib/positions/hydrate";
import { classifyInventory, type InventoryItem } from "@/lib/positions/inventory";

const CALLS_PER_ID = 4;

export function useHydrateInventory({
  tokenIds,
  wallet,
  enabled,
}: {
  tokenIds: readonly bigint[];
  wallet?: Address;
  enabled: boolean;
}) {
  const contracts = useMemo(
    () =>
      tokenIds.flatMap((tokenId) => [
        {
          address: ADDRESSES.positionManager,
          abi: erc721Abi,
          functionName: "ownerOf" as const,
          args: [tokenId] as const,
        },
        {
          address: ADDRESSES.positionManager,
          abi: positionManagerAbi,
          functionName: "getPoolAndPositionInfo" as const,
          args: [tokenId] as const,
        },
        {
          address: ADDRESSES.positionManager,
          abi: positionManagerAbi,
          functionName: "getPositionLiquidity" as const,
          args: [tokenId] as const,
        },
        {
          address: ADDRESSES.vault,
          abi: vaultAbi,
          functionName: "getLoan" as const,
          args: [tokenId] as const,
        },
      ]),
    [tokenIds],
  );

  const query = useReadContracts({
    allowFailure: true,
    contracts,
    query: {
      enabled: enabled && tokenIds.length > 0 && Boolean(wallet),
      refetchInterval: (current) => {
        const data = current.state.data;
        if (!data) return false;
        for (let i = 0; i < tokenIds.length; i += 1) {
          const loan = asLoan(data[i * CALLS_PER_ID + 3]?.result);
          if (loan?.locked && !loan.active && !loan.repaid && !loan.liquidated) {
            return 4000;
          }
        }
        return false;
      },
    },
  });

  const items = useMemo(() => {
    const data = query.data;
    if (!data || !wallet) return [] as InventoryItem[];
    const cards: InventoryItem[] = [];
    for (let i = 0; i < tokenIds.length; i += 1) {
      const base = i * CALLS_PER_ID;
      const ownerResult = data[base];
      const poolResult = data[base + 1];
      const liquidityResult = data[base + 2];
      const loanResult = data[base + 3];
      const classified = classifyInventory({
        tokenId: tokenIds[i],
        owner:
          ownerResult?.status === "success"
            ? (ownerResult.result as Address)
            : undefined,
        poolKey:
          poolResult?.status === "success" ? asPoolKey(poolResult.result) : undefined,
        liquidity:
          liquidityResult?.status === "success"
            ? (liquidityResult.result as bigint)
            : undefined,
        loan: loanResult?.status === "success" ? asLoan(loanResult.result) : undefined,
        wallet,
      });
      cards.push(...classified);
    }
    return cards;
  }, [query.data, tokenIds, wallet]);

  return {
    items,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetched: query.isFetched,
    refetch: query.refetch,
  };
}
