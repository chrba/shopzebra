import { describe, expect, it } from 'vitest'
import type { PayloadAction } from '../createSlice'
import type { OutboxEntry, SyncStorage } from './outbox'
import type { SendResult } from './transport'
import { SyncEngine } from './syncEngine'
// Side-effect import: registers 'shopping' as a synced slice name (see
// createSlice({ synced: true })). Vitest isolates modules per test file,
// so this must happen here too — same pattern as syncedActions.test.ts.
import '../../features/shopping/domain/shoppingSlice'

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

describe('SyncEngine', () => {
  it('buffers actions recorded before start and sends them after start', async () => {
    const engine = new SyncEngine()
    const sent: OutboxEntry[] = []
    engine.record(syncedAction('early'))
    await engine.start({
      storage: memoryStorage(),
      dispatch: () => undefined,
      send: (entry) => {
        sent.push(entry)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchListIds: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(1)
  })

  it('ignores remote and unsynced actions', async () => {
    const engine = new SyncEngine()
    const sent: OutboxEntry[] = []
    engine.record({
      type: 'app/appLoaded',
      payload: {},
      meta: { eventId: 'x', deviceId: 'd1' },
    })
    engine.record({
      ...syncedAction('r1'),
      meta: { eventId: 'r1', deviceId: 'd1', remote: true },
    })
    await engine.start({
      storage: memoryStorage(),
      dispatch: () => undefined,
      send: (entry) => {
        sent.push(entry)
        return Promise.resolve<SendResult>({ outcome: 'confirmed' })
      },
      fetchListIds: () => Promise.resolve([]),
      fetchEventsSince: () => Promise.resolve([]),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sent).toHaveLength(0)
  })
})
