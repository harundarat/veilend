import { isAddress } from "viem";
import { ADDRESSES } from "@/lib/contracts";
import {
  collectTokenIds,
  type AlchemyPage,
} from "@/lib/positions/alchemy";

export const dynamic = "force-dynamic";

const ALCHEMY_NFT_URL = "https://eth-sepolia.g.alchemy.com/nft/v3";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const UNAVAILABLE = { error: "position discovery unavailable" } as const;

function unavailable() {
  return Response.json(UNAVAILABLE, { status: 503 });
}

async function fetchOwnerPage(apiKey: string, owner: string, pageKey?: string) {
  const url = new URL(`${ALCHEMY_NFT_URL}/${apiKey}/getNFTsForOwner`);
  url.searchParams.set("owner", owner);
  url.searchParams.append("contractAddresses[]", ADDRESSES.positionManager);
  url.searchParams.set("withMetadata", "false");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  if (pageKey) url.searchParams.set("pageKey", pageKey);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as AlchemyPage;
}

export async function GET(request: Request) {
  const apiKey = process.env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) return unavailable();

  const owner = new URL(request.url).searchParams.get("owner")?.trim() ?? "";
  if (!isAddress(owner)) {
    return Response.json({ error: "invalid owner" }, { status: 400 });
  }

  try {
    const pages: AlchemyPage[] = [];
    let pageKey: string | undefined;
    for (let i = 0; i < MAX_PAGES; i += 1) {
      const page = await fetchOwnerPage(apiKey, owner, pageKey);
      if (!page) return unavailable();
      pages.push(page);
      const next =
        typeof page.pageKey === "string" && page.pageKey.length > 0
          ? page.pageKey
          : undefined;
      if (!next) break;
      pageKey = next;
    }
    return Response.json({ tokenIds: collectTokenIds(pages) });
  } catch {
    return unavailable();
  }
}
