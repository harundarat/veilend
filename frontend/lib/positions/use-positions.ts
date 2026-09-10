"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { sepolia } from "wagmi/chains";
import { ADDRESSES } from "@/lib/contracts";
import { fetchPositionIds, unionTokenIds } from "@/lib/positions/discover";

export function useDiscoveredPositions({
  wallet,
  chainId,
}: {
  wallet?: Address;
  chainId: number;
}) {
  const sepoliaOk = chainId === sepolia.id;
  const enabled = Boolean(wallet) && sepoliaOk;

  const query = useQuery({
    queryKey: ["veilend-positions", wallet, chainId],
    enabled,
    queryFn: async () => {
      if (!wallet) return { tokenIds: [] as string[], unavailable: true };
      const [owned, vault] = await Promise.all([
        fetchPositionIds(wallet),
        fetchPositionIds(ADDRESSES.vault),
      ]);
      return {
        tokenIds: unionTokenIds(owned.tokenIds, vault.tokenIds),
        unavailable: owned.unavailable || vault.unavailable,
      };
    },
  });

  return {
    tokenIds: query.data?.tokenIds ?? [],
    unavailable: !sepoliaOk || query.isError || Boolean(query.data?.unavailable),
    isLoading: enabled && query.isPending,
    refetch: query.refetch,
  };
}
