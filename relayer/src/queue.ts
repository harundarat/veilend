import type { PositionLockedEvent } from "./watch"

export type HandleOutcome = "done" | "retry"

export function eventKey(event: PositionLockedEvent): string {
  return event.positionId.toString()
}

export function committedCursor(pending: Iterable<PositionLockedEvent>, head: bigint): bigint {
  let minBlock: bigint | undefined
  for (const event of pending) {
    if (minBlock === undefined || event.blockNumber < minBlock) {
      minBlock = event.blockNumber
    }
  }
  if (minBlock === undefined) return head
  return minBlock === 0n ? 0n : minBlock - 1n
}

export class PendingQueue {
  private readonly pending = new Map<string, PositionLockedEvent>()
  private readonly seen = new Set<string>()
  private draining = false
  private rerun = false
  private drainTail: Promise<number> = Promise.resolve(0)

  get size(): number {
    return this.pending.size
  }

  values(): PositionLockedEvent[] {
    return [...this.pending.values()]
  }

  enqueue(event: PositionLockedEvent): void {
    const key = eventKey(event)
    if (this.seen.has(key)) return
    this.pending.set(key, event)
    if (this.draining) this.rerun = true
  }

  cursor(head: bigint): bigint {
    return committedCursor(this.pending.values(), head)
  }

  async drain(handler: (event: PositionLockedEvent) => Promise<HandleOutcome>): Promise<number> {
    if (this.draining) {
      this.rerun = true
      return this.drainTail
    }
    this.draining = true
    this.drainTail = this.run(handler).finally(() => {
      this.draining = false
    })
    return this.drainTail
  }

  private async run(handler: (event: PositionLockedEvent) => Promise<HandleOutcome>): Promise<number> {
    const attempted = new Set<string>()
    do {
      this.rerun = false
      for (const event of [...this.pending.values()]) {
        const key = eventKey(event)
        if (this.seen.has(key)) {
          this.pending.delete(key)
          continue
        }
        if (attempted.has(key)) continue
        attempted.add(key)
        const outcome = await handler(event)
        if (outcome === "done") {
          this.seen.add(key)
          this.pending.delete(key)
        }
      }
    } while (this.rerun)
    return this.pending.size
  }
}
