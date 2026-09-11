import { type Address, isAddress } from "viem";

export const DISCOVERY_UNAVAILABLE =
  "Automated position discovery is currently unavailable. You can inspect positions directly by ID.";

export type DiscoverResult = {
  tokenIds: string[];
  unavailable: boolean;
};

type PositionsResponse = {
  tokenIds?: unknown;
  error?: unknown;
};

export function unionTokenIds(...lists: Array<Iterable<string>>) {
  const seen = new Set<string>();
  const tokenIds: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      if (!raw || seen.has(raw)) continue;
      seen.add(raw);
      tokenIds.push(raw);
    }
  }
  return tokenIds;
}

function asTokenIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" && typeof item !== "number") continue;
    try {
      const id = BigInt(item);
      if (id < BigInt(0)) continue;
      ids.push(id.toString());
    } catch {
      continue;
    }
  }
  return ids;
}

export async function fetchPositionIds(owner: Address): Promise<DiscoverResult> {
  if (!isAddress(owner)) return { tokenIds: [], unavailable: true };
  try {
    const response = await fetch(`/api/positions?owner=${owner}`);
    const body = (await response.json()) as PositionsResponse;
    if (!response.ok) {
      return { tokenIds: [], unavailable: true };
    }
    return { tokenIds: asTokenIds(body.tokenIds), unavailable: false };
  } catch {
    return { tokenIds: [], unavailable: true };
  }
}
