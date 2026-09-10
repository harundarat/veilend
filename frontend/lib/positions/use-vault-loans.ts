"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ADDRESSES, erc721Abi, vaultAbi, type VaultLoan } from "@/lib/contracts";
import { fetchPositionIds, unionTokenIds } from "@/lib/positions/discover";
import { asLoan, hasLoan } from "@/lib/positions/hydrate";
import {
  fetchLiquidatedLoanIds,
  fetchLockedLoanIds,
  fetchWalletLoanIds,
} from "@/lib/positions/vault-loans";

export type VaultLoanRow = {
  tokenId: bigint;
  loan: VaultLoan;
  owner?: Address;
};

const CALLS_PER_ID = 2;

export function useVaultLoanIds({
  chainId,
  extraIds = [],
}: {
  chainId: number;
  extraIds?: readonly string[];
}) {
  const publicClient = usePublicClient();
  const sepoliaOk = chainId === sepolia.id;
  const enabled = Boolean(publicClient);

  const query = useQuery({
    queryKey: ["veilend-vault-loan-ids", chainId],
    enabled,
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!publicClient) return { tokenIds: [] as string[], unavailable: true };

      let vaultIds: string[] = [];
      let unavailable = false;
      if (sepoliaOk) {
        const vault = await fetchPositionIds(ADDRESSES.vault);
        vaultIds = vault.tokenIds;
        unavailable = vault.unavailable;
      }

      const [liquidatedIds, lockedIds] = await Promise.all([
        fetchLiquidatedLoanIds(publicClient, chainId).catch(() => [] as string[]),
        sepoliaOk && !unavailable
          ? Promise.resolve([] as string[])
          : fetchLockedLoanIds(publicClient, chainId).catch(() => [] as string[]),
      ]);

      return {
        tokenIds: unionTokenIds(vaultIds, liquidatedIds, lockedIds),
        unavailable,
      };
    },
  });

  return {
    tokenIds: unionTokenIds(query.data?.tokenIds ?? [], extraIds),
    unavailable: Boolean(query.data?.unavailable) || query.isError,
    isLoading: enabled && query.isPending,
    refetch: query.refetch,
  };
}

export function useWalletLoanEventIds({
  wallet,
  chainId,
  enabled,
}: {
  wallet?: Address;
  chainId: number;
  enabled: boolean;
}) {
  const publicClient = usePublicClient();
  const query = useQuery({
    queryKey: ["veilend-wallet-loan-events", wallet, chainId],
    enabled: enabled && Boolean(wallet) && Boolean(publicClient),
    refetchOnReconnect: true,
    queryFn: async () => {
      if (!publicClient || !wallet) return [] as string[];
      return fetchWalletLoanIds(publicClient, chainId, wallet);
    },
  });

  return {
    tokenIds: query.data ?? [],
    isLoading: enabled && query.isPending,
    refetch: query.refetch,
  };
}

export function useHydrateVaultLoans({
  tokenIds,
  enabled,
}: {
  tokenIds: readonly bigint[];
  enabled: boolean;
}) {
  const contracts = useMemo(
    () =>
      tokenIds.flatMap((tokenId) => [
        {
          address: ADDRESSES.vault,
          abi: vaultAbi,
          functionName: "getLoan" as const,
          args: [tokenId] as const,
        },
        {
          address: ADDRESSES.positionManager,
          abi: erc721Abi,
          functionName: "ownerOf" as const,
          args: [tokenId] as const,
        },
      ]),
    [tokenIds],
  );

  const query = useReadContracts({
    allowFailure: true,
    contracts,
    query: { enabled: enabled && tokenIds.length > 0 },
  });

  const rows = useMemo(() => {
    const data = query.data;
    if (!data) return [] as VaultLoanRow[];
    const result: VaultLoanRow[] = [];
    for (let i = 0; i < tokenIds.length; i += 1) {
      const base = i * CALLS_PER_ID;
      const loanResult = data[base];
      const ownerResult = data[base + 1];
      const loan = loanResult?.status === "success" ? asLoan(loanResult.result) : undefined;
      if (!hasLoan(loan) || !loan || loan.repaid) continue;
      result.push({
        tokenId: tokenIds[i],
        loan,
        owner:
          ownerResult?.status === "success" ? (ownerResult.result as Address) : undefined,
      });
    }
    return result;
  }, [query.data, tokenIds]);

  return {
    rows,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetched: query.isFetched,
    refetch: query.refetch,
  };
}
