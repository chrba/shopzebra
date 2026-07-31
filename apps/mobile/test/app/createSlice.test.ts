import { describe, expect, it } from 'vitest'
import { createSlice, belongsToSyncedSlice } from '@/app/createSlice'

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
