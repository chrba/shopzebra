import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import type { SyncStorage } from '@/app/sync/outbox'
import type { SendResult, Transport } from '@/app/sync/transport'
import { SyncEngine } from '@/app/sync/syncEngine'
import { appSyncPolicy } from '@/app/sync/appSyncPolicy'

// The barrier in front of a command that speaks to the server about
// something this device wrote — minting an invite for a list whose
// listCreated may still be queued.

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

describe('SyncEngine push barrier', () => {
  it('does not return before the queued event has left the device', async () => {
    let deliver: () => void = () => undefined
    const sent: string[] = []
    const transport: Transport = {
      sendEntry: (entry) =>
        new Promise<SendResult>((resolve) => {
          deliver = () => {
            sent.push(entry.wire.meta?.eventId ?? '')
            resolve({ outcome: 'confirmed' })
          }
        }),
      fetchAggregates: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    }
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    await engine.start(() => undefined)

    engine.offer(syncedAction('e1'))
    let pushed = false
    const barrier = engine.pushQueuedEvents().then(() => {
      pushed = true
    })

    await settle()
    expect(pushed).toBe(false)

    deliver()
    await barrier
    expect(sent).toEqual(['e1'])
  })

  // The case requestSync() alone cannot cover: mid-cycle it hands back the
  // running cycle, whose drain is already past. The barrier has to wait for
  // the follow-up cycle that the coalescing left behind.
  it('waits for the cycle that follows the one already running', async () => {
    let releasePull: () => void = () => undefined
    let deliver: () => void = () => undefined
    let pulls = 0
    const sent: string[] = []
    const transport: Transport = {
      sendEntry: (entry) =>
        new Promise<SendResult>((resolve) => {
          deliver = () => {
            sent.push(entry.wire.meta?.eventId ?? '')
            resolve({ outcome: 'confirmed' })
          }
        }),
      fetchAggregates: () => {
        pulls += 1
        if (pulls === 1) {
          // Hold cycle 1 open, past its (empty) drain.
          return new Promise((resolve) => {
            releasePull = () => resolve([])
          })
        }
        return Promise.resolve([])
      },
      fetchEventsSince: () => Promise.resolve([]),
    }
    const engine = new SyncEngine(memoryStorage(), transport, appSyncPolicy)
    const firstCycle = engine.start(() => undefined)
    await settle()

    // Written while cycle 1 is pulling — its drain will never see this.
    engine.offer(syncedAction('e1'))
    await settle()
    expect(sent).toEqual([])

    let pushed = false
    const barrier = engine.pushQueuedEvents().then(() => {
      pushed = true
    })
    await settle()
    expect(pushed).toBe(false)

    // Cycle 1 ends and hands over to the follow-up, which is now sending.
    // Returning here would be the bug: the entry has not left yet.
    releasePull()
    await settle()
    expect(sent).toEqual([])
    expect(pushed).toBe(false)

    deliver()
    await barrier
    expect(sent).toEqual(['e1'])
    await firstCycle
  })

  // Offline, the caller has to be told something. A barrier that waits for
  // a queue that cannot move would leave the invite screen on its skeleton
  // for good.
  it('gives up when the queue is stuck instead of waiting forever', async () => {
    let attempts = 0
    const engine = new SyncEngine(
      memoryStorage(),
      {
        sendEntry: () => {
          attempts += 1
          return Promise.resolve<SendResult>({ outcome: 'retry' })
        },
        fetchAggregates: () => Promise.resolve([]),
        fetchEventsSince: () => Promise.resolve([]),
      },
      appSyncPolicy,
    )
    await engine.start(() => undefined)

    engine.offer(syncedAction('e1'))
    await settle()

    await engine.pushQueuedEvents()

    expect(attempts).toBeGreaterThan(0)
    engine.stop()
  })

  // A guest's log is open but the engine may not contact anyone. The barrier
  // has to return rather than wait for a cycle that will never run.
  it('returns at once while the device has no account', async () => {
    const sent: string[] = []
    const engine = new SyncEngine(
      memoryStorage(),
      {
        sendEntry: (entry) => {
          sent.push(entry.wire.meta?.eventId ?? '')
          return Promise.resolve<SendResult>({ outcome: 'confirmed' })
        },
        fetchAggregates: () => Promise.resolve([]),
        fetchEventsSince: () => Promise.resolve([]),
      },
      appSyncPolicy,
    )
    // openLocalLog, not start: the log lives, server contact does not.
    await engine.openLocalLog(() => undefined)

    engine.offer(syncedAction('e1'))
    await settle()

    await engine.pushQueuedEvents()

    expect(sent).toEqual([])
  })

  it('returns at once when nothing is queued', async () => {
    const engine = new SyncEngine(
      memoryStorage(),
      {
        sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
        fetchAggregates: () => Promise.resolve([]),
        fetchEventsSince: () => Promise.resolve([]),
      },
      appSyncPolicy,
    )
    await engine.start(() => undefined)

    await expect(engine.pushQueuedEvents()).resolves.toBeUndefined()
  })
})
