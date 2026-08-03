import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { friendRemoved, selectFriends } from './domain/friendsSlice'
import { removeFriend } from './friendCommands'
import { memberAvatarColor, memberInitial } from '../lists/domain/memberAvatar'
import { MEMBER_NAME_FALLBACK } from '../sharing/memberDisplayName'
import {
  FirstShareNameSheet,
  needsNameBeforeSharing,
} from '../sharing/FirstShareNameSheet'
import { selectIdentity } from '../auth/domain/authSlice'
import { SwipeAction } from '../../components/SwipeAction'
import { InviteIcon } from '../../components/InviteIcon'
import { useToast } from '../../components/Toast'
import { PageHeader } from '../../components/PageHeader'
import { DangerConfirmDialog } from '../../components/DangerConfirmDialog'

/** One friend of the address book: avatar and name, swipe reveals removal. */
function FriendCard({ id, name }: { readonly id: string; readonly name: string }) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3">
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
        style={{ backgroundColor: memberAvatarColor(id) }}
      >
        {memberInitial(name)}
      </div>
      <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {name}
      </div>
    </div>
  )
}

/** The card that leads to the friendship invite screen. */
function InviteFriendCta({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      className="bg-card mx-5 mt-4 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-6 active:opacity-70"
      onClick={onClick}
    >
      <span className="bg-teal/10 text-teal mb-1 flex size-11 items-center justify-center rounded-full">
        <InviteIcon className="size-[18px] fill-current" />
      </span>
      <span className="text-[15px] font-semibold">Neuen Freund einladen</span>
      <span className="text-muted-foreground text-[13px]">
        Per QR-Code, Link, WhatsApp oder E-Mail
      </span>
    </button>
  )
}

/**
 * The address book (proposals/friends-concept.html, screen 1): every friend
 * as a card, removal via the same swipe-right gesture as in the lists
 * overview, and the invite CTA at the bottom.
 */
export function FriendsPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const friends = useAppSelector(selectFriends)
  const identity = useAppSelector(selectIdentity)
  const toast = useToast()

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [askingForName, setAskingForName] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly id: string
    readonly name: string
  } | null>(null)

  const handleConfirmRemoval = () => {
    const target = pendingRemoval
    setPendingRemoval(null)
    setOpenSwipeId(null)
    if (!target) return

    // Optimistic: removal only touches our own side, nothing to reconcile.
    dispatch(friendRemoved({ friendId: target.id }))
    removeFriend(target.id).catch((error: unknown) => {
      console.warn('removing the friend failed', error)
      toast.show('Entfernen fehlgeschlagen')
    })
  }

  const goToInvite = () => void navigate({ to: '/friends/invite' })

  // Screen 1A: a friendship link is shared like everything else, so a
  // device without an account is asked for a name over this screen first.
  const handleInvite = () => {
    if (needsNameBeforeSharing(identity)) {
      setAskingForName(true)
      return
    }
    goToInvite()
  }

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader
        title="Freunde"
        backLabel="Listen"
        onBack={() => void navigate({ to: '/lists' })}
      />

      <div className="text-muted-foreground mb-2 px-6 text-xs font-semibold tracking-wider uppercase">
        {friends.length} {friends.length === 1 ? 'Freund' : 'Freunde'}
      </div>

      <div className="mx-5 flex flex-col gap-2">
        {friends.map((friend) => {
          const name = friend.name ?? MEMBER_NAME_FALLBACK
          return (
            <SwipeAction
              key={friend.id}
              isOpen={openSwipeId === friend.id}
              onOpen={() => setOpenSwipeId(friend.id)}
              onClose={() => setOpenSwipeId(null)}
              label="Entfernen"
              tone="destructive"
              onTrigger={() => setPendingRemoval({ id: friend.id, name })}
            >
              <FriendCard id={friend.id} name={name} />
            </SwipeAction>
          )
        })}
      </div>

      <InviteFriendCta onClick={handleInvite} />

      {askingForName && (
        <FirstShareNameSheet
          onDone={() => {
            setAskingForName(false)
            goToInvite()
          }}
        />
      )}

      <DangerConfirmDialog
        open={pendingRemoval !== null}
        title={`${pendingRemoval?.name} entfernen?`}
        message={`${pendingRemoval?.name} verschwindet aus deiner Freundesliste. Gemeinsame Einkaufslisten bleiben unverändert.`}
        confirmLabel="Entfernen"
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      {toast.element}
    </div>
  )
}
