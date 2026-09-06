import { describe, expect, it } from 'vitest'
import { inviteStateOf } from '@/features/sharing/inviteStateOf'
import type { Aggregate } from '@/app/sync/aggregate'

const list1: Aggregate = { kind: 'list', id: 'l1' }

function answering(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }))
}

function unreachableServer() {
  return () => Promise.reject(new TypeError('Failed to fetch'))
}

describe('inviteStateOf', () => {
  it('hands the screen the token the server minted', async () => {
    const state = await inviteStateOf(
      list1,
      answering(201, { token: 'tok-1', expiresAt: 42 }),
    )

    expect(state).toEqual({
      status: 'ready',
      invite: { token: 'tok-1', expiresAt: 42 },
    })
  })

  // notOwner is decided from the store before this runs, so whoever reaches
  // here believes they own the aggregate — a 403 means the server has not
  // heard of it yet. That is a race another try fixes; "only the owner may
  // invite" would strand the user on a dead end with a Zurück button.
  it('offers another try when the server refuses, rather than a dead end', async () => {
    const state = await inviteStateOf(
      list1,
      answering(403, { error: 'caller is not a member of this aggregate' }),
    )

    expect(state).toEqual({ status: 'unreachable' })
  })

  it('reports a request that never arrived as unreachable', async () => {
    const state = await inviteStateOf(list1, unreachableServer())

    expect(state).toEqual({ status: 'unreachable' })
  })

  // A server that broke may well work on the next tap — that IS worth a retry.
  it('reports a server error as unreachable', async () => {
    const state = await inviteStateOf(list1, answering(500, {}))

    expect(state).toEqual({ status: 'unreachable' })
  })

  it('reports half a token as unreachable rather than showing a broken link', async () => {
    const state = await inviteStateOf(list1, answering(201, { token: 'tok-1' }))

    expect(state).toEqual({ status: 'unreachable' })
  })
})
