import { describe, expect, it } from 'vitest'
import { createSlice, type PayloadAction } from '@/app/createSlice'
import { needsSync } from '@/app/sync/needsSync'

// A slice of its own, so the test states the rule rather than leaning on
// whatever roles the feature slices happen to declare today.
const demo = createSlice({
  name: 'needsSyncDemo',
  initialState: {},
  synced: true,
  reducers: {
    anEvent: { role: 'event', reducer: (state: object) => state },
    aCommand: { role: 'command', reducer: (state: object) => state },
    aLocalEvent: { role: 'localEvent', reducer: (state: object) => state },
    anObservation: { role: 'observation', reducer: (state: object) => state },
    aHydration: { role: 'hydration', reducer: (state: object) => state },
  },
})

const meta = { eventId: 'e1', deviceId: 'd1' }

const dispatched = (
  creator: { readonly type: string },
): PayloadAction<unknown> => ({ type: creator.type, payload: {}, meta })

describe('needsSync', () => {
  it('schickt event-Actions zum Server', () => {
    expect(needsSync(dispatched(demo.actions.anEvent))).toBe(true)
  })

  it('schickt command-Actions zum Server', () => {
    expect(needsSync(dispatched(demo.actions.aCommand))).toBe(true)
  })

  it('behält localEvent-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.aLocalEvent))).toBe(false)
  })

  it('behält observation-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.anObservation))).toBe(false)
  })

  it('behält hydration-Actions auf dem Gerät', () => {
    expect(needsSync(dispatched(demo.actions.aHydration))).toBe(false)
  })

  it('schickt Actions ohne Rolle nie', () => {
    expect(
      needsSync({ type: 'preferences/themeChanged', payload: {}, meta }),
    ).toBe(false)
  })

  it('schickt Server-Echos nie zurück', () => {
    expect(
      needsSync({
        type: demo.actions.anEvent.type,
        payload: {},
        meta: { ...meta, remote: true },
      }),
    ).toBe(false)
  })

  it('schickt Actions ohne meta nie', () => {
    expect(needsSync({ type: demo.actions.anEvent.type, payload: {} })).toBe(
      false,
    )
  })
})
