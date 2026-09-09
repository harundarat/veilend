import { describe, expect, test } from "bun:test"
import {
  GET_LOGS_MAX_RANGE,
  fetchPositionLocked,
  logBlockChunks,
  toPositionLockedEvent,
  type PositionLockedLog,
} from "../src/watch"

const complete: PositionLockedLog = {
  args: {
    borrower: "0x0000000000000000000000000000000000000001",
    positionId: 7n,
    timestamp: 1n,
  },
  blockNumber: 40n,
  transactionHash: "0xabc",
  logIndex: 2,
}

describe("toPositionLockedEvent", () => {
  test("returns the event when every field is present", () => {
    expect(toPositionLockedEvent(complete)).toEqual({
      borrower: "0x0000000000000000000000000000000000000001",
      positionId: 7n,
      timestamp: 1n,
      blockNumber: 40n,
      transactionHash: "0xabc",
      logIndex: 2,
    })
  })

  test("drops logs that are missing a confirmed block number", () => {
    expect(toPositionLockedEvent({ ...complete, blockNumber: null })).toBeUndefined()
  })

  test("drops logs that are missing transaction identity", () => {
    expect(toPositionLockedEvent({ ...complete, transactionHash: null })).toBeUndefined()
    expect(toPositionLockedEvent({ ...complete, logIndex: null })).toBeUndefined()
  })

  test("drops logs with empty decoded args", () => {
    expect(toPositionLockedEvent({ ...complete, args: {} })).toBeUndefined()
    expect(toPositionLockedEvent({ ...complete, args: { ...complete.args, positionId: undefined } })).toBeUndefined()
  })
})

describe("logBlockChunks", () => {
  test("returns one chunk when the range fits", () => {
    expect(logBlockChunks(10n, 20n, 100n)).toEqual([{ fromBlock: 10n, toBlock: 20n }])
  })

  test("splits inclusive ranges on the max size", () => {
    expect(logBlockChunks(1n, 25_000n, GET_LOGS_MAX_RANGE)).toEqual([
      { fromBlock: 1n, toBlock: 10_000n },
      { fromBlock: 10_001n, toBlock: 20_000n },
      { fromBlock: 20_001n, toBlock: 25_000n },
    ])
  })

  test("returns no chunks when fromBlock is past toBlock", () => {
    expect(logBlockChunks(5n, 4n, 10n)).toEqual([])
  })
})

describe("fetchPositionLocked", () => {
  test("issues one getLogs call per chunk and skips incomplete logs", async () => {
    const calls: { fromBlock: bigint; toBlock: bigint }[] = []
    const client = {
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        calls.push({ fromBlock, toBlock })
        if (fromBlock === 1n) {
          return [
            complete,
            { ...complete, blockNumber: null, args: { ...complete.args, positionId: 8n } },
          ]
        }
        return [{ ...complete, args: { ...complete.args, positionId: 9n }, blockNumber: 12_000n }]
      },
    }
    const events = await fetchPositionLocked({
      client: client as never,
      vault: "0x0000000000000000000000000000000000000002",
      fromBlock: 1n,
      toBlock: 15_000n,
    })
    expect(calls).toEqual([
      { fromBlock: 1n, toBlock: 10_000n },
      { fromBlock: 10_001n, toBlock: 15_000n },
    ])
    expect(events.map((event) => event.positionId)).toEqual([7n, 9n])
  })
})
