import { describe, expect, it } from 'vitest'
import { eventIdMiddleware } from '@/app/eventIdMiddleware'
import type { AppState } from '@/app/appSlice'
import type { PayloadAction } from '@/app/createSlice'

// The middleware contract: every locally dispatched payload action gets a
// fresh eventId + the device's id; server-originated actions pass through
// untouched. Tested with plain functions — no mock framework.

type AnyAction = { readonly type: string }

function runMiddleware(action: AnyAction): AnyAction {
  const appState: { readonly app: AppState } = {
    app: { theme: 'dark', deviceId: 'device-1', initialSyncDone: false },
  }
  const passThrough = (dispatched: unknown): unknown => dispatched
  const dispatch = <T>(dispatched: T): T => dispatched
  const result = eventIdMiddleware({ getState: () => appState, dispatch })(
    passThrough,
  )(action)
  return result as AnyAction
}

function metaOf(action: AnyAction): PayloadAction<unknown>['meta'] {
  return (action as PayloadAction<unknown>).meta
}

describe('eventIdMiddleware', () => {
  it('stattet lokale Actions mit eventId und deviceId aus', () => {
    const result = runMiddleware({ type: 'lists/listRenamed' })

    expect(metaOf(result)?.eventId).toBeTypeOf('string')
    expect(metaOf(result)?.deviceId).toBe('device-1')
  })

  it('vergibt für jeden Dispatch eine neue eventId', () => {
    const first = runMiddleware({ type: 'lists/listRenamed' })
    const second = runMiddleware({ type: 'lists/listRenamed' })

    expect(metaOf(first)?.eventId).not.toBe(metaOf(second)?.eventId)
  })

  it('lässt Server-Actions unverändert — die eventId vom Server bleibt', () => {
    const serverAction = {
      type: 'lists/listRenamed',
      payload: { listId: 'groceries', name: 'Neu' },
      meta: {
        remote: true,
        eventId: 'server-event-1',
        deviceId: 'other-device',
      },
    }

    const result = runMiddleware(serverAction)

    expect(result).toBe(serverAction)
  })
})
