import { describe, expect, test } from "bun:test"
import { committedCursor, PendingQueue, type HandleOutcome } from "../src/queue"
import type { PositionLockedEvent } from "../src/watch"

function event(positionId: bigint, blockNumber: bigint): PositionLockedEvent {
  return {
    borrower: "0x0000000000000000000000000000000000000001",
    positionId,
    timestamp: 1n,
    blockNumber,
    transactionHash: "0x1",
    logIndex: 0,
  }
}

describe("committedCursor", () => {
  test("returns head when nothing is pending", () => {
    expect(committedCursor([], 50n)).toBe(50n)
  })

  test("does not advance past the earliest unprocessed block", () => {
    expect(committedCursor([event(1n, 40n), event(2n, 45n)], 50n)).toBe(39n)
  })
})

describe("PendingQueue", () => {
  test("keeps failed events pending and leaves cursor on that block", async () => {
    const queue = new PendingQueue()
    queue.enqueue(event(7n, 100n))
    const remaining = await queue.drain(async () => "retry")
    expect(remaining).toBe(1)
    expect(queue.cursor(110n)).toBe(99n)
  })

  test("marks successful events seen and advances cursor to head", async () => {
    const queue = new PendingQueue()
    queue.enqueue(event(7n, 100n))
    const remaining = await queue.drain(async () => "done")
    expect(remaining).toBe(0)
    expect(queue.cursor(110n)).toBe(110n)
    queue.enqueue(event(7n, 101n))
    expect(queue.size).toBe(0)
  })

  test("does not retry a failed id in the same drain", async () => {
    const queue = new PendingQueue()
    queue.enqueue(event(1n, 1n))
    const calls: bigint[] = []
    await queue.drain(async (item) => {
      calls.push(item.positionId)
      queue.enqueue(event(1n, 1n))
      return "retry"
    })
    expect(calls).toEqual([1n])
    expect(queue.size).toBe(1)
  })

  test("serializes overlapping drain calls onto one handler at a time", async () => {
    const queue = new PendingQueue()
    queue.enqueue(event(1n, 1n))
    queue.enqueue(event(2n, 2n))
    let running = 0
    let maxRunning = 0
    const order: bigint[] = []
    const handler = async (item: PositionLockedEvent): Promise<HandleOutcome> => {
      running++
      maxRunning = Math.max(maxRunning, running)
      order.push(item.positionId)
      await Bun.sleep(20)
      running--
      return "done"
    }
    const first = queue.drain(handler)
    const second = queue.drain(handler)
    await Promise.all([first, second])
    expect(maxRunning).toBe(1)
    expect(order).toEqual([1n, 2n])
  })

  test("processes a new id enqueued while draining", async () => {
    const queue = new PendingQueue()
    queue.enqueue(event(1n, 1n))
    const order: bigint[] = []
    await queue.drain(async (item) => {
      order.push(item.positionId)
      if (item.positionId === 1n) queue.enqueue(event(2n, 2n))
      return "done"
    })
    expect(order).toEqual([1n, 2n])
    expect(queue.size).toBe(0)
  })
})
