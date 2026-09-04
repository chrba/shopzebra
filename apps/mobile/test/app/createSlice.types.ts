// Compile-time contract of createSlice declarations. Checked by
// `pnpm exec tsc --noEmit`, not by vitest: each @ts-expect-error below must
// suppress exactly one error, so a contract that stops holding fails tsc.

import { createSlice, type PayloadAction } from '@/app/createSlice'

type Demo = { readonly seen: string }
const initialState: Demo = { seen: '' }

// A well-declared slice compiles.
createSlice({
  name: 'typesOk',
  synced: true,
  initialState,
  reducers: {
    renamed: {
      role: 'event',
      on: 'list',
      reducer: (
        _state: Demo,
        action: PayloadAction<{
          readonly listId: string
          readonly name: string
        }>,
      ): Demo => ({ seen: action.payload.name }),
    },
    created: {
      role: 'event',
      opens: 'recipe',
      reducer: (
        _state: Demo,
        action: PayloadAction<{ readonly recipeId: string }>,
      ): Demo => ({ seen: action.payload.recipeId }),
    },
    dropped: { role: 'localEvent', reducer: (state: Demo): Demo => state },
  },
})

// An event on a list must take a payload that names the list.
createSlice({
  name: 'typesMissingId',
  synced: true,
  initialState,
  reducers: {
    renamed: {
      role: 'event',
      on: 'list',
      // @ts-expect-error an event on 'list' must carry a string listId
      reducer: (
        _state: Demo,
        action: PayloadAction<{ readonly name: string }>,
      ): Demo => ({ seen: action.payload.name }),
    },
  },
})

// An event must say which aggregate it is on or opens.
createSlice({
  name: 'typesNoAggregate',
  synced: true,
  initialState,
  // @ts-expect-error role 'event' needs on or opens
  reducers: {
    renamed: { role: 'event', reducer: (state: Demo): Demo => state },
  },
})

// An event is on a log or opens one — never both.
createSlice({
  name: 'typesOnAndOpens',
  synced: true,
  initialState,
  // @ts-expect-error on and opens are mutually exclusive
  reducers: {
    confused: {
      role: 'event',
      on: 'list',
      opens: 'recipe',
      reducer: (
        _state: Demo,
        action: PayloadAction<{
          readonly listId: string
          readonly recipeId: string
        }>,
      ): Demo => ({ seen: action.payload.listId }),
    },
  },
})

// A synced slice accepts no bare reducer.
// @ts-expect-error a synced reducer must declare its role
createSlice({
  name: 'typesNoRole',
  synced: true,
  initialState,
  reducers: {
    renamed: (state: Demo): Demo => state,
  },
})
