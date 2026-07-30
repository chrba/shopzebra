import { describe, expect, it } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import type { OutboxEntry } from '@/app/sync/outbox'
import { sendEntry } from '@/app/sync/send/sendEntry'

const entry: OutboxEntry = {
  path: '/lists/list-1/events',
  wire: {
    type: 'shopping/itemAdded',
    payload: { listId: 'list-1', itemId: 'apples' },
    meta: { eventId: 'e1', deviceId: 'device-1' },
  },
}

function respondingWith(status: number, body: unknown): Fetcher {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

describe('sendEntry', () => {
  it('posts an event to its list log and confirms on 200', async () => {
    const calls: string[] = []
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(
        new Response(
          JSON.stringify({ position: '00000000000000000007', eventId: 'e1' }),
          { status: 200 },
        ),
      )
    }
    const result = await sendEntry(entry, fetcher)
    expect(result).toEqual({ outcome: 'confirmed' })
    expect(calls).toEqual(['/lists/list-1/events'])
  })

  it('posts a command to its own path', async () => {
    const calls: string[] = []
    const command: OutboxEntry = {
      path: '/lists',
      wire: {
        type: 'lists/listCreated',
        payload: { listId: 'l1', name: 'REWE', createdBy: 'user-1' },
        meta: { eventId: 'e9', deviceId: 'device-1' },
      },
    }
    const fetcher: Fetcher = (path) => {
      calls.push(path)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    await sendEntry(command, fetcher)
    expect(calls).toEqual(['/lists'])
  })

  it('classifies 4xx as rejected and 5xx as retry', async () => {
    expect(await sendEntry(entry, respondingWith(403, {}))).toEqual({
      outcome: 'rejected',
      status: 403,
    })
    expect(await sendEntry(entry, respondingWith(503, {}))).toEqual({
      outcome: 'retry',
    })
  })

  it('classifies network errors as retry', async () => {
    const offline: Fetcher = () => Promise.reject(new Error('offline'))
    expect(await sendEntry(entry, offline)).toEqual({ outcome: 'retry' })
  })
})
