export type AlchemyNft = {
  tokenId?: unknown;
};

export type AlchemyPage = {
  ownedNfts?: AlchemyNft[];
  pageKey?: unknown;
};

export function parseAlchemyTokenId(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw).trim();
  if (!value) return null;
  try {
    const id = BigInt(value);
    if (id < BigInt(0)) return null;
    return id.toString();
  } catch {
    return null;
  }
}

export function collectTokenIds(pages: AlchemyPage[]) {
  const seen = new Set<string>();
  const tokenIds: string[] = [];
  for (const page of pages) {
    for (const nft of page.ownedNfts ?? []) {
      const id = parseAlchemyTokenId(nft.tokenId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      tokenIds.push(id);
    }
  }
  return tokenIds;
}
