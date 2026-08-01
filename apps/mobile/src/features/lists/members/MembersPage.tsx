import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { store, useAppSelector } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { selectAuthUser } from '../../auth/domain/authSlice'
import { selectListById, selectListMembers } from '../domain/listsSlice'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'
import { memberDisplayName } from './memberDisplayName'
import { removeMember } from './memberCommands'
import { useToast } from './Toast'
import { Button } from '../../../components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog'
import { syncEngine } from '../../../app/sync/syncEngine'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  )
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

type MembersPageProps = {
  readonly listId: string
}

/**
 * Members of one list, always visible — the tab toggle from
 * design/pure/invite.html was dropped. Inviting lives on its own screen,
 * reached through the CTA card at the bottom.
 */
export function MembersPage({ listId }: MembersPageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const members = useAppSelector((state) => selectListMembers(state, listId))
  const me = useAppSelector(selectAuthUser)
  const toast = useToast()

  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly id: string
    readonly name: string
  } | null>(null)

  const isOwner = me !== null && list?.ownerId === me.userId

  const handleConfirmRemoval = () => {
    const target = pendingRemoval
    setPendingRemoval(null)
    if (!target) return

    void removeMember(listId, target.id, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
      .then(async () => {
        // The server writes listMemberRemoved; the fold arrives with the
        // next pull, so the card disappears once sync confirms it.
        await syncEngine.requestSync()
        toast.show(`${target.name} wurde entfernt`)
      })
      .catch((error: unknown) => {
        console.warn('removing the member failed', error)
        toast.show('Entfernen fehlgeschlagen')
      })
  }

  if (!list) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8 text-center">
        <p className="text-muted-foreground text-[15px]">
          Diese Liste gibt es nicht mehr.
        </p>
      </div>
    )
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
          Zurück
        </Button>
        <h1 className="font-display text-[17px] font-bold">Mitglieder</h1>
        <div className="w-[70px]" />
      </header>

      <div className="mx-5 flex flex-col gap-2.5">
        {members.map((member) => {
          const name = memberDisplayName(member, me)
          const isMe = me !== null && member.id === me.userId
          return (
            <div
              key={member.id}
              className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5"
            >
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
                style={{ backgroundColor: memberAvatarColor(member.id) }}
              >
                {memberInitial(name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{name}</div>
                <div
                  className={`text-[13px] font-medium ${
                    member.isOwner ? 'text-teal' : 'text-muted-foreground'
                  }`}
                >
                  {member.isOwner ? 'Admin' : 'Mitglied'}
                  {isMe ? ' · Du' : ''}
                </div>
              </div>
              {isOwner && !isMe && (
                <button
                  className="bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full active:scale-[0.92]"
                  aria-label={`${name} entfernen`}
                  onClick={() => setPendingRemoval({ id: member.id, name })}
                >
                  <RemoveIcon />
                </button>
              )}
            </div>
          )
        })}

        {isOwner && (
          <button
            className="bg-card mt-2 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-6 active:opacity-70"
            onClick={() =>
              void navigate({
                to: '/lists/$listId/invite',
                params: { listId },
              })
            }
          >
            <span className="bg-teal/10 text-teal mb-1 flex size-11 items-center justify-center rounded-full">
              <InviteIcon />
            </span>
            <span className="text-[15px] font-semibold">
              Neues Mitglied einladen
            </span>
            <span className="text-muted-foreground text-[13px]">
              Per QR-Code, Link, WhatsApp oder E-Mail
            </span>
          </button>
        )}
      </div>

      <AlertDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{pendingRemoval?.name} entfernen?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingRemoval?.name} hat dann keinen Zugriff mehr auf diese
            Einkaufsliste.
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
