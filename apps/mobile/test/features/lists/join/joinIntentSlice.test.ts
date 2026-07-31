import { describe, expect, it } from 'vitest'
import {
  joinIntentCleared,
  joinIntentReducer,
  joinIntentRestored,
  joinIntentStored,
  selectPendingJoinToken,
} from '@/features/lists/join/joinIntentSlice'

type JoinIntentRootState = Parameters<typeof selectPendingJoinToken>[0]

const initialization = { type: '@@INIT' }

function rootStateAfter(
  ...actions: readonly { readonly type: string }[]
): JoinIntentRootState {
  const joinIntent = actions.reduce(
    joinIntentReducer,
    joinIntentReducer(undefined, initialization),
  )
  return { joinIntent }
}

describe('the pending join intent', () => {
  it('is empty until a join is deferred', () => {
    expect(selectPendingJoinToken(rootStateAfter())).toBeNull()
  })

  it('remembers the token of an invite opened without a session', () => {
    const state = rootStateAfter(joinIntentStored({ token: 'tok-1' }))

    expect(selectPendingJoinToken(state)).toBe('tok-1')
  })

  it('is cleared once the join was attempted', () => {
    const state = rootStateAfter(
      joinIntentStored({ token: 'tok-1' }),
      joinIntentCleared(),
    )

    expect(selectPendingJoinToken(state)).toBeNull()
  })

  it('keeps only the most recent invite when two are opened', () => {
    const state = rootStateAfter(
      joinIntentStored({ token: 'tok-1' }),
      joinIntentStored({ token: 'tok-2' }),
    )

    expect(selectPendingJoinToken(state)).toBe('tok-2')
  })

  it('comes back from storage on a cold start', () => {
    const state = rootStateAfter(joinIntentRestored({ token: 'tok-1' }))

    expect(selectPendingJoinToken(state)).toBe('tok-1')
  })

  it('restores nothing when storage was empty', () => {
    const state = rootStateAfter(joinIntentRestored({ token: null }))

    expect(selectPendingJoinToken(state)).toBeNull()
  })
})
