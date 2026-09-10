import { type PublicClient } from "viem";
import { sepolia } from "wagmi/chains";
import {
  ADDRESSES,
  VAULT_DEPLOY_BLOCK,
  vaultEventsAbi,
} from "@/lib/contracts";
import { unionTokenIds } from "@/lib/positions/discover";

export const LOG_CHUNK = BigInt(1000);

function vaultEvent(name: "PositionLocked" | "LoanLiquidated") {
  const item = vaultEventsAbi.find((entry) => entry.type === "event" && entry.name === name);
  if (!item || item.type !== "event") {
    throw new Error(`missing vault event ${name}`);
  }
  return item;
}

const POSITION_LOCKED = vaultEvent("PositionLocked");
const LOAN_LIQUIDATED = vaultEvent("LoanLiquidated");

function positionIdFromLog(log: { args?: { positionId?: unknown } }) {
  const value = log.args?.positionId;
  if (typeof value === "bigint" && value >= BigInt(0)) return value.toString();
  return null;
}

async function collectEventIds(
  publicClient: PublicClient,
  event: typeof POSITION_LOCKED | typeof LOAN_LIQUIDATED,
  chainId: number,
) {
  const startBlock = chainId === sepolia.id ? VAULT_DEPLOY_BLOCK : BigInt(0);
  const latest = await publicClient.getBlockNumber();
  const ids: string[] = [];
  const seen = new Set<string>();

  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let from = startBlock;
  while (from <= latest) {
    const end = from + LOG_CHUNK - BigInt(1);
    const toBlock = end < latest ? end : latest;
    ranges.push({ fromBlock: from, toBlock });
    from = toBlock + BigInt(1);
  }

  const PARALLEL = 5;
  for (let i = 0; i < ranges.length; i += PARALLEL) {
    const batch = ranges.slice(i, i + PARALLEL);
    const pages = await Promise.all(
      batch.map((range) =>
        publicClient.getLogs({
          address: ADDRESSES.vault,
          event,
          ...range,
        }),
      ),
    );
    for (const logs of pages) {
      for (const log of logs) {
        const id = positionIdFromLog(log);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return ids;
}

export async function fetchLiquidatedLoanIds(publicClient: PublicClient, chainId: number) {
  return collectEventIds(publicClient, LOAN_LIQUIDATED, chainId);
}

export async function fetchLockedLoanIds(publicClient: PublicClient, chainId: number) {
  return collectEventIds(publicClient, POSITION_LOCKED, chainId);
}

export function mergeVaultLoanIds(...lists: Array<Iterable<string>>) {
  return unionTokenIds(...lists);
}
