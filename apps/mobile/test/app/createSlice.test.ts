import { describe, expect, it } from 'vitest'
import { createSlice, type PayloadAction } from '@/app/createSlice'

describe('sync declarations', () => {
  it('gibt die Deklaration jedes synced Reducers unter seinem Action-Typ zurück', () => {
    const slice = createSlice({
      name: 'declaredDemo',
      initialState: {},
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          on: 'list',
          reducer: (
            state: object,
            _action: PayloadAction<{ readonly listId: string }>,
          ) => state,
        },
        thingCreated: {
          role: 'event',
          opens: 'list',
          reducer: (
            state: object,
            _action: PayloadAction<{ readonly listId: string }>,
          ) => state,
        },
        thingDropped: { role: 'localEvent', reducer: (state: object) => state },
        thingsLoaded: { role: 'hydration', reducer: (state: object) => state },
      },
    })

    expect(slice.declarations).toEqual({
      'declaredDemo/thingRenamed': { role: 'event', on: 'list' },
      'declaredDemo/thingCreated': { role: 'event', opens: 'list' },
      'declaredDemo/thingDropped': { role: 'localEvent' },
      'declaredDemo/thingsLoaded': { role: 'hydration' },
    })
  })

  it('hat keine Deklarationen für einen unsynced Slice', () => {
    const slice = createSlice({
      name: 'undeclaredDemo',
      initialState: {},
      reducers: { somethingHappened: (state: object) => state },
    })

    expect(slice.declarations).toEqual({})
  })

  it('erzeugt für die Deklarationsform funktionierende Action Creators', () => {
    const slice = createSlice({
      name: 'creatorDemo',
      initialState: { seen: '' },
      synced: true,
      reducers: {
        thingRenamed: {
          role: 'event',
          on: 'list',
          reducer: (
            _state: { readonly seen: string },
            action: PayloadAction<{ readonly listId: string; readonly name: string }>,
          ) => ({ seen: action.payload.name }),
        },
      },
    })

    const action = slice.actions.thingRenamed({ listId: 'l1', name: 'Brot' })

    expect(action).toEqual({
      type: 'creatorDemo/thingRenamed',
      payload: { listId: 'l1', name: 'Brot' },
    })
    expect(slice.reducer({ seen: '' }, action)).toEqual({ seen: 'Brot' })
  })
})
