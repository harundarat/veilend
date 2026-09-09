import type { Address, PublicClient } from "viem"

export type PositionLockedEvent = {
  borrower: Address
  positionId: bigint
  timestamp: bigint
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex: number
}

export function rpcUsesWebSocket(rpcUrl: string): boolean {
  return rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://")
}

const positionLockedEvent = {
  type: "event",
  name: "PositionLocked",
  inputs: [
    { name: "borrower", type: "address", indexed: true },
    { name: "positionId", type: "uint256", indexed: true },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const

export async function fetchPositionLocked(params: {
  client: PublicClient
  vault: Address
  fromBlock: bigint
  toBlock: bigint
}): Promise<PositionLockedEvent[]> {
  const logs = await params.client.getLogs({
    address: params.vault,
    event: positionLockedEvent,
    fromBlock: params.fromBlock,
    toBlock: params.toBlock,
  })
  return logs.map((log) => ({
    borrower: log.args.borrower as Address,
    positionId: log.args.positionId as bigint,
    timestamp: log.args.timestamp as bigint,
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash ?? "0x",
    logIndex: log.logIndex ?? 0,
  }))
}
