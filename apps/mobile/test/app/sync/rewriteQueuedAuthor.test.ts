import { describe, expect, test } from 'vitest'
import type { PayloadAction } from '@/app/createSlice'
import { Outbox, type OutboxEntry, type SyncStorage } from '@/app/sync/outbox'

function memoryStorage(): SyncStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      data.set(key, value)
      return Promise.resolve()
    },
  }
}

function entry(
  path: string,
  type: string,
  payload: Readonly<Record<string, unknown>>,
): OutboxEntry {
  const wire: PayloadAction<unknown> = {
    type,
    payload,
    meta: { eventId: `${type}-1`, deviceId: 'device-1' },
  }
  return { path, wire }
}

/** The payload of a queued entry, as the drain would send it. */
function payloadsOf(outbox: Outbox): readonly Record<string, unknown>[] {
  return outbox
    .queuedEntries()
    .map((queued) => queued.wire.payload as Record<string, unknown>)
}

async function outboxWith(entries: readonly OutboxEntry[]): Promise<{
  readonly outbox: Outbox
  readonly storage: SyncStorage
}> {
  const storage = memoryStorage()
  const outbox = await Outbox.load(storage)
  for (const queued of entries) await outbox.enqueue(queued)
  return { outbox, storage }
}

describe('rewriting the author of the queued log', () => {
  // The queued listCreated of a guest carries the sentinel — after the
  // shadow account exists the server would reject it (CreatorMustBeCaller).
  test('rewrites author fields in every queued entry', async () => {
    const { outbox } = await outboxWith([
      entry('/lists', 'lists/listCreated', {
        listId: 'l1',
        name: 'Einkauf',
        createdBy: 'local-user',
      }),
      entry('/lists/l1/events', 'shopping/itemAdded', {
        listId: 'l1',
        itemId: 'i1',
        addedBy: 'local-user',
      }),
    ])

    await outbox.rewriteAuthor('local-user', 'sub-123')

    const payloads = payloadsOf(outbox)
    expect(payloads[0]?.createdBy).toBe('sub-123')
    expect(payloads[1]?.addedBy).toBe('sub-123')
  })

  // A list called "local-user" must survive: only author FIELDS are
  // rewritten, never arbitrary values.
  test('does not touch non-author fields with the same value', async () => {
    const { outbox } = await outboxWith([
      entry('/lists', 'lists/listCreated', {
        listId: 'l1',
        name: 'local-user',
        createdBy: 'local-user',
      }),
    ])

    await outbox.rewriteAuthor('local-user', 'sub-123')

    const payloads = payloadsOf(outbox)
    expect(payloads[0]?.name).toBe('local-user')
    expect(payloads[0]?.createdBy).toBe('sub-123')
  })

  test('leaves foreign authors alone', async () => {
    const { outbox } = await outboxWith([
      entry('/lists/l1/events', 'shopping/itemChecked', {
        listId: 'l1',
        itemId: 'i1',
        checkedBy: 'other-sub',
      }),
    ])

    await outbox.rewriteAuthor('local-user', 'sub-123')

    expect(payloadsOf(outbox)[0]?.checkedBy).toBe('other-sub')
  })

  // The rewrite has to survive the restart it is meant to protect: the
  // engine reloads the queue from storage, not from memory.
  test('persists the rewritten queue', async () => {
    const { outbox, storage } = await outboxWith([
      entry('/lists', 'lists/listCreated', {
        listId: 'l1',
        name: 'Einkauf',
        createdBy: 'local-user',
      }),
    ])

    await outbox.rewriteAuthor('local-user', 'sub-123')

    const reloaded = await Outbox.load(storage)
    expect(payloadsOf(reloaded)[0]?.createdBy).toBe('sub-123')
  })
})
