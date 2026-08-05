import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch } from '../../app/store'
import { ensureIdentity } from '../auth/domain/identityThunks'
import { friendIntentCleared } from '../lists/join/joinIntentSlice'
import { friendsLoaded } from './domain/friendsSlice'
import { acceptFriendInvite, fetchFriends } from './friendCommands'
import { InviteIcon } from '../../components/InviteIcon'
import { Button } from '../../components/ui/button'

type AcceptFriendPageProps = {
  readonly token: string
}

/**
 * What the invitee sees after opening a friendship link (screen 4 of the
 * friends proposal). Unlike a list join this never auto-accepts — becoming
 * someone's contact deserves an explicit yes.
 *
 * Deviation from the mockup: the inviter's name is not shown before
 * accepting. The backend has no token-peek endpoint, and putting the name
 * into the link itself would let anyone forge "Mama möchte dich hinzufügen".
 */
export function AcceptFriendPage({ token }: AcceptFriendPageProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [state, setState] = useState<'asking' | 'accepting' | 'failed'>(
    'asking',
  )

  const finish = (to: '/friends' | '/lists') => {
    dispatch(friendIntentCleared())
    void navigate({ to })
  }

  const accept = async () => {
    setState('accepting')
    // Becoming somebody's contact needs an account; it is made here rather
    // than asked for — this device has had a name since its first start.
    await dispatch(ensureIdentity())
    try {
      await acceptFriendInvite(token)
    } catch (error: unknown) {
      console.warn('accepting the friend invite failed', error)
      setState('failed')
      return
    }
    // Refresh the address book so the new friend is visible on arrival.
    try {
      dispatch(friendsLoaded({ friends: await fetchFriends() }))
    } catch (error: unknown) {
      console.warn('refreshing friends after accept failed', error)
    }
    finish('/friends')
  }

  const handleAccept = () => void accept()


  if (state === 'failed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <h1 className="font-display text-[19px] font-bold">
          Einladung nicht gültig
        </h1>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Dieser Freundschaftslink ist ungültig oder abgelaufen. Bitte lass dir
          einen neuen schicken.
        </p>
        <Button
          className="mt-2 h-auto rounded-2xl px-6 py-3 text-[15px] font-semibold"
          onClick={() => finish('/lists')}
        >
          Zu meinen Listen
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex shrink-0 items-center justify-center px-6 pt-2 pb-4">
        <h1 className="font-display text-[17px] font-bold">Einladung</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="bg-teal/10 text-teal mb-5 flex size-[88px] items-center justify-center rounded-full">
          <InviteIcon className="size-9 fill-current" />
        </div>
        <h2 className="font-display mb-2 text-[21px] font-bold">
          Jemand möchte dich als Freund hinzufügen
        </h2>
        <p className="text-muted-foreground mb-8 text-[14px] leading-relaxed">
          Ihr steht danach gegenseitig in euren Freundeslisten und könnt
          Einkaufslisten mit einem Tap teilen.
        </p>
        <Button
          className="h-auto w-full rounded-[20px] bg-gradient-to-br from-[#4E9DA6] to-[#3A8A92] py-[17px] text-base font-bold text-white"
          disabled={state === 'accepting'}
          onClick={handleAccept}
        >
          {state === 'accepting' ? 'Einen Moment …' : 'Annehmen'}
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground mt-2 h-auto py-[15px] text-[15px] font-semibold"
          disabled={state === 'accepting'}
          onClick={() => finish('/lists')}
        >
          Ablehnen
        </Button>
      </div>
    </div>
  )
}
