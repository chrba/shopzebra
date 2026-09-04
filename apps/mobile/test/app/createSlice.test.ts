import { describe, expect, it } from 'vitest'
import {
  createSlice,
  belongsToSyncedSlice,
  roleOf,
  type PayloadAction,
} from '@/app/createSlice'

describe('synced slices', () => {
  it('registers synced slices for the outbox policy', () => {
    createSlice({
      name: 'syncedDemo',
      initialState: {},
      reducers: {},
      synced: true,
    })
    createSlice({ name: 'localDemo', initialState: {}, reducers: {} })

    expect(belongsToSyncedSlice('syncedDemo/somethingHappened')).toBe(true)
    expect(belongsToSyncedSlice('localDemo/somethingHappened')).toBe(false)
    expect(belongsToSyncedSlice('unknown/action')).toBe(false)
  })
})

describe('action role registry', () => {
  it('registriert die deklarierte Rolle eines synced Reducers', () => {
    createSlice({
      name: 'roledDemo',
      initialState: {},
      synced: true,
      reducers: {
        somethingHappened: {
          role: 'event',
          reducer: (state: object) => state,
        },
        somethingLoaded: {
          role: 'hydration',
          reducer: (state: object) => state,
        },
      },
    })

    expect(roleOf('roledDemo/somethingHappened')).toBe('event')
    expect(roleOf('roledDemo/somethingLoaded')).toBe('hydration')
  })

  it('kennt keine Rolle für Actions unsynced Slices', () => {
    createSlice({
      name: 'unroledDemo',
      initialState: {},
      reducers: { somethingHappened: (state: object) => state },
    })

    expect(roleOf('unroledDemo/somethingHappened')).toBeUndefined()
  })

  it('kennt keine Rolle für unbekannte Action-Typen', () => {
    expect(roleOf('never/registered')).toBeUndefined()
  })

  it('erzeugt für die Rollen-Form weiterhin funktionierende Action Creators', () => {
    const slice = createSlice({
      name: 'creatorDemo',
      initialState: { seen: '' },
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          reducer: (
            _state: { readonly seen: string },
            action: PayloadAction<{ readonly name: string }>,
          ) => ({ seen: action.payload.name }),
        },
      },
    })

    const action = slice.actions.thingRenamed({ name: 'Brot' })

    expect(action).toEqual({
      type: 'creatorDemo/thingRenamed',
      payload: { name: 'Brot' },
    })
    expect(slice.reducer({ seen: '' }, action)).toEqual({ seen: 'Brot' })
  })
})
