import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import type { OutboxEntry, SyncStorage } from '@/app/sync/outbox'
import type { SendResult, Transport } from '@/app/sync/transport'
import { SyncEngine } from '@/app/sync/syncEngine'
// Side-effect import: registers 'shopping' as a synced slice name (see
// createSlice({ synced: true })). Vitest isolates modules per test file,
// so this must happen here too — same pattern as syncEngine.test.ts.
import '@/features/shopping/domain/shoppingSlice'

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

describe('SyncEngine.stop', () => {
  it('buffers actions recorded after stop and delivers them on the next start', async () => {
    const sent: OutboxEntry[] = []
    const transport: Transport = {
      sendEntry: (entry) => {
        sent.push(entry)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchListIds: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    }
    const engine = new SyncEngine(memoryStorage(), transport)

    await engine.start(() => undefined)
    engine.stop()

    // Recorded while stopped — must buffer, not throw or drop silently.
    engine.record(syncedAction('after-stop'))

    await engine.start(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sent).toHaveLength(1)
  })

  it('makes refresh() a no-op after stop', async () => {
    const fetchListIdsCalls: true[] = []
    const fetchEventsSinceCalls: true[] = []
    const engine = new SyncEngine(memoryStorage(), {
      sendEntry: () => Promise.resolve<SendResult>({ outcome: 'confirmed' }),
      fetchListIds: () => {
        fetchListIdsCalls.push(true)
        return Promise.resolve([])
      },
      fetchEventsSince: () => {
        fetchEventsSinceCalls.push(true)
        return Promise.resolve([])
      },
    })

    await engine.start(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))

    engine.stop()
    fetchListIdsCalls.length = 0
    fetchEventsSinceCalls.length = 0

    engine.refresh()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchListIdsCalls).toHaveLength(0)
    expect(fetchEventsSinceCalls).toHaveLength(0)
  })
})
