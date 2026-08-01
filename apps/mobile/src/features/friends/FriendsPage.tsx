import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { friendRemoved, selectFriends } from './domain/friendsSlice'
import { removeFriend } from './friendCommands'
import { memberAvatarColor, memberInitial } from '../lists/domain/memberAvatar'
import { MEMBER_NAME_FALLBACK } from '../lists/members/memberDisplayName'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import { InviteIcon } from '../../components/InviteIcon'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
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
  const toast = useToast()

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
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

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => void navigate({ to: '/lists' })}
        >
          <BackIcon />
          Listen
        </Button>
        <h1 className="font-display text-[17px] font-bold">Freunde</h1>
        <div className="w-[70px]" />
      </header>

      <div className="text-muted-foreground mb-2 px-6 text-xs font-semibold tracking-wider uppercase">
        {friends.length} {friends.length === 1 ? 'Freund' : 'Freunde'}
      </div>

      <div className="mx-5 flex flex-col gap-2">
        {friends.map((friend) => {
          const name = friend.name ?? MEMBER_NAME_FALLBACK
          return (
            <SwipeToDelete
              key={friend.id}
              isOpen={openSwipeId === friend.id}
              onOpen={() => setOpenSwipeId(friend.id)}
              onClose={() => setOpenSwipeId(null)}
              onDelete={() => setPendingRemoval({ id: friend.id, name })}
            >
              <div className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
                  style={{ backgroundColor: memberAvatarColor(friend.id) }}
                >
                  {memberInitial(name)}
                </div>
                <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {name}
                </div>
              </div>
            </SwipeToDelete>
          )
        })}
      </div>

      <button
        className="bg-card mx-5 mt-4 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-6 active:opacity-70"
        onClick={() => void navigate({ to: '/friends/invite' })}
      >
        <span className="bg-teal/10 text-teal mb-1 flex size-11 items-center justify-center rounded-full">
          <InviteIcon className="size-[18px] fill-current" />
        </span>
        <span className="text-[15px] font-semibold">Neuen Freund einladen</span>
        <span className="text-muted-foreground text-[13px]">
          Per QR-Code, Link, WhatsApp oder E-Mail
        </span>
      </button>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{pendingRemoval?.name} entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.name} verschwindet aus deiner Freundesliste.
            Gemeinsame Einkaufslisten bleiben unverändert.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white"
              onClick={handleConfirmRemoval}
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {toast.element}
    </div>
  )
}
