// A refused command answers with a status, and the callers that act on it
// must read that status — not go looking for the digits in the message. The
// message names the path, and the path carries ids.

import { describe, expect, test } from 'vitest'
import type { Fetcher } from '@/app/authFetch'
import {
  CommandRefused,
  addMember,
  refusedBecauseFull,
  removeMember,
} from '@/features/sharing/memberCommands'
import type { Aggregate } from '@/app/sync/aggregate'

const groceries: Aggregate = { kind: 'list', id: 'l1' }
const meta = { eventId: 'e1', deviceId: 'd1' }

const answering =
  (status: number): Fetcher =>
  () =>
    Promise.resolve(new Response(null, { status }))

describe('a command the server turned down', () => {
  test('carries the status the server answered with', async () => {
    const refusal = await removeMember(
      groceries,
      'tom',
      meta,
      answering(500),
    ).then(
      () => null,
      (error: unknown) => error,
    )

    expect(refusal).toBeInstanceOf(CommandRefused)
    expect((refusal as CommandRefused).status).toBe(500)
  })

  test('the member cap is recognised by its status, nothing else', async () => {
    const full = await addMember(groceries, 'tom', meta, answering(409)).then(
      () => null,
      (error: unknown) => error,
    )
    const other = await addMember(groceries, 'tom', meta, answering(403)).then(
      () => null,
      (error: unknown) => error,
    )

    expect(refusedBecauseFull(full)).toBe(true)
    expect(refusedBecauseFull(other)).toBe(false)
    expect(refusedBecauseFull(new Error('POST /lists/409/members → 500'))).toBe(
      false,
    )
  })
})
