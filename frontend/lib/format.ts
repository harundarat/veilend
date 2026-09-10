import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";

export function truncateAddress(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function formatAmount(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatToken(value: bigint, decimals = 18) {
  const asNumber = Number(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return formatUnits(value, decimals);
  }
  return formatAmount(asNumber);
}

export function formatBps(bps: bigint) {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

export function formatLiquidity(value: bigint) {
  return value.toLocaleString("en-US");
}

export function explorerTxUrl(hash: string, chainId: number) {
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${hash}`;
  return undefined;
}
