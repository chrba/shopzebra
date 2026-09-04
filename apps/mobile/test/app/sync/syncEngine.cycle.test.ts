import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import type { SyncStorage } from '@/app/sync/outbox'
import type { SendResult, Transport } from '@/app/sync/transport'
import { SyncEngine } from '@/app/sync/syncEngine'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'

function memoryStorage(): SyncStorage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function syncedAction(eventId: string): PayloadAction<unknown> {
  return {
    type: 'shopping/itemChecked',
    payload: { listId: 'l1', itemId: 'x', checkedBy: 'u1' },
    meta: { eventId, deviceId: 'd1' },
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

// Each fetchAggregates call marks the pull step of one sync cycle.
function countingTransport(): Transport & { pulls: () => number } {
  let pulls = 0
  return {
    sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
    fetchAggregates: () => {
      pulls += 1
      return Promise.resolve([])
    },
    fetchEventsSince: () => Promise.resolve([]),
    pulls: () => pulls,
  }
}

describe('SyncEngine sync cycle', () => {
  it('runs one push-then-pull cycle after an action was recorded', async () => {
    const transport = countingTransport()
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    await engine.start(() => undefined)
    expect(transport.pulls()).toBe(1)

    engine.record(syncedAction('e1'))
    await settle()
    expect(transport.pulls()).toBe(2)
  })

  it('terminates — no follow-up pull without new work', async () => {
    const transport = countingTransport()
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    await engine.start(() => undefined)

    engine.record(syncedAction('e1'))
    await settle()
    await settle()
    expect(transport.pulls()).toBe(2)
  })

  it('pushes own events before it pulls', async () => {
    const order: string[] = []
    const transport: Transport = {
      sendEntry: (entry) => {
        order.push(`push:${entry.wire.meta?.eventId ?? ''}`)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchAggregates: () => {
        order.push('pull')
        return Promise.resolve([])
      },
      fetchEventsSince: () => Promise.resolve([]),
    }
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    await engine.start(() => undefined)

    engine.record(syncedAction('e1'))
    await settle()
    expect(order).toEqual(['pull', 'push:e1', 'pull'])
  })

  it('coalesces triggers during a running cycle into one follow-up cycle', async () => {
    let release: () => void = () => undefined
    let pulls = 0
    const sent: string[] = []
    const transport: Transport = {
      sendEntry: (entry) => {
        sent.push(entry.wire.meta?.eventId ?? '')
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchAggregates: () => {
        pulls += 1
        if (pulls === 2) {
          // Hold the second cycle's pull open to provoke overlap.
          return new Promise((resolve) => {
            release = () => resolve([])
          })
        }
        return Promise.resolve([])
      },
      fetchEventsSince: () => Promise.resolve([]),
    }
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    await engine.start(() => undefined)

    engine.record(syncedAction('e1'))
    await settle()
    expect(pulls).toBe(2)

    // Recorded while cycle 2 is still pulling — must wait, not overlap.
    engine.record(syncedAction('e2'))
    await settle()
    expect(pulls).toBe(2)
    expect(sent).toEqual(['e1'])

    release()
    await settle()
    expect(pulls).toBe(3)
    expect(sent).toEqual(['e1', 'e2'])
  })
})

describe('SyncEngine retry backoff', () => {
  afterEach(() => vi.useRealTimers())

  it('retries a blocked queue with exponential backoff until delivered', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const engine = new SyncEngine(memoryStorage(), {
      sendEntry: () => {
        attempts += 1
        return Promise.resolve<SendResult>(
          attempts < 3 ? { outcome: 'retry' } : { outcome: 'confirmed' },
        )
      },
      fetchAggregates: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    }, appSyncPolicy)
    await engine.start(() => undefined)

    engine.record(syncedAction('e1'))
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(attempts).toBe(2)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(attempts).toBe(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(attempts).toBe(3)
  })

  it('stop cancels the scheduled retry', async () => {
    vi.useFakeTimers()
    let attempts = 0
    const engine = new SyncEngine(memoryStorage(), {
      sendEntry: () => {
        attempts += 1
        return Promise.resolve<SendResult>({ outcome: 'retry' })
      },
      fetchAggregates: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    }, appSyncPolicy)
    await engine.start(() => undefined)

    engine.record(syncedAction('e1'))
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)

    engine.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(attempts).toBe(1)
  })
})
