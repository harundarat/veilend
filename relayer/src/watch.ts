import type { Address, PublicClient } from "viem"

export const GET_LOGS_MAX_RANGE = 10_000n

export type PositionLockedEvent = {
  borrower: Address
  positionId: bigint
  timestamp: bigint
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex: number
}

export type PositionLockedLog = {
  args: { borrower?: Address; positionId?: bigint; timestamp?: bigint }
  blockNumber: bigint | null
  transactionHash: `0x${string}` | null
  logIndex: number | null
}

export function rpcUsesWebSocket(rpcUrl: string): boolean {
  return rpcUrl.startsWith("ws://") || rpcUrl.startsWith("wss://")
}

export const positionLockedEvent = {
  type: "event",
  name: "PositionLocked",
  inputs: [
    { name: "borrower", type: "address", indexed: true },
    { name: "positionId", type: "uint256", indexed: true },
    { name: "timestamp", type: "uint256", indexed: false },
  ],
} as const

export function toPositionLockedEvent(log: PositionLockedLog): PositionLockedEvent | undefined {
  const borrower = log.args.borrower
  const positionId = log.args.positionId
  const timestamp = log.args.timestamp
  if (
    borrower === undefined ||
    positionId === undefined ||
    timestamp === undefined ||
    log.blockNumber === null ||
    log.transactionHash === null ||
    log.logIndex === null
  ) {
    return undefined
  }
  return {
    borrower,
    positionId,
    timestamp,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }
}

export function logBlockChunks(
  fromBlock: bigint,
  toBlock: bigint,
  maxRange: bigint = GET_LOGS_MAX_RANGE,
): { fromBlock: bigint; toBlock: bigint }[] {
  if (fromBlock > toBlock || maxRange <= 0n) return []
  const chunks: { fromBlock: bigint; toBlock: bigint }[] = []
  let from = fromBlock
  while (from <= toBlock) {
    const chunkTo = from + maxRange - 1n
    const to = chunkTo < toBlock ? chunkTo : toBlock
    chunks.push({ fromBlock: from, toBlock: to })
    from = to + 1n
  }
  return chunks
}

export async function fetchPositionLocked(params: {
  client: PublicClient
  vault: Address
  fromBlock: bigint
  toBlock: bigint
}): Promise<PositionLockedEvent[]> {
  const events: PositionLockedEvent[] = []
  for (const chunk of logBlockChunks(params.fromBlock, params.toBlock)) {
    const logs = await params.client.getLogs({
      address: params.vault,
      event: positionLockedEvent,
      fromBlock: chunk.fromBlock,
      toBlock: chunk.toBlock,
    })
    for (const log of logs) {
      const event = toPositionLockedEvent(log)
      if (event !== undefined) events.push(event)
    }
  }
  return events
}
