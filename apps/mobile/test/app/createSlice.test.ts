import { describe, expect, it } from 'vitest'
import { createSlice, isSyncedActionType } from '@/app/createSlice'

describe('synced slices', () => {
  it('registers synced slices for the outbox policy', () => {
    createSlice({
      name: 'syncedDemo',
      initialState: {},
      reducers: {},
      synced: true,
    })
    createSlice({ name: 'localDemo', initialState: {}, reducers: {} })

    expect(isSyncedActionType('syncedDemo/somethingHappened')).toBe(true)
    expect(isSyncedActionType('localDemo/somethingHappened')).toBe(false)
    expect(isSyncedActionType('unknown/action')).toBe(false)
  })
})
