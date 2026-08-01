import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { store, useAppSelector } from '../../../app/store'
import { selectDeviceId } from '../../../app/appSlice'
import { selectAuthUser } from '../../auth/domain/authSlice'
import {
  selectListById,
  selectListIsFull,
  selectListMembers,
  selectMaxMembers,
} from '../domain/listsSlice'
import { selectFriends } from '../../friends/domain/friendsSlice'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'
import { MEMBER_NAME_FALLBACK, memberDisplayName } from './memberDisplayName'
import { addMemberToList, removeMember } from './memberCommands'
import { useToast } from '../../../components/Toast'
import { InviteIcon } from '../../../components/InviteIcon'
import { PageHeader } from '../../../components/PageHeader'
import { DangerConfirmDialog } from '../../../components/DangerConfirmDialog'
import { syncEngine } from '../../../app/sync/syncEngine'

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-current">
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </svg>
  )
}

/** Coloured circle with the person's initial — the avatar of every row. */
function AvatarCircle({ id, name }: { readonly id: string; readonly name: string }) {
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
      style={{ backgroundColor: memberAvatarColor(id) }}
    >
      {memberInitial(name)}
    </div>
  )
}

type MemberCardProps = {
  readonly name: string
  readonly memberId: string
  readonly role: string
  readonly isOwnerRole: boolean
  /** Present only when the viewer may remove this member. */
  readonly onRemove: (() => void) | null
}

/** One member of the list: avatar, name, role line, optional remove button. */
function MemberCard({ name, memberId, role, isOwnerRole, onRemove }: MemberCardProps) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5">
      <AvatarCircle id={memberId} name={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{name}</div>
        <div
          className={`text-[13px] font-medium ${
            isOwnerRole ? 'text-teal' : 'text-muted-foreground'
          }`}
        >
          {role}
        </div>
      </div>
      {onRemove && (
        <button
          className="bg-destructive/10 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full active:scale-[0.92]"
          aria-label={`${name} entfernen`}
          onClick={onRemove}
        >
          <RemoveIcon />
        </button>
      )}
    </div>
  )
}

type FriendCandidateRowProps = {
  readonly name: string
  readonly friendId: string
  readonly disabled: boolean
  readonly onAdd: () => void
}

/** A friend not yet on the list — one tap puts them on it. */
function FriendCandidateRow({ name, friendId, disabled, onAdd }: FriendCandidateRowProps) {
  return (
    <button
      className="bg-card flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-70 disabled:opacity-40"
      disabled={disabled}
      onClick={onAdd}
    >
      <AvatarCircle id={friendId} name={name} />
      <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {name}
      </div>
      <span className="size-[26px] shrink-0 rounded-full border-2 border-white/20" />
    </button>
  )
}

/** The card that leads to the invite screen (link, QR, WhatsApp, e-mail). */
function InviteCta({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      className="bg-card mt-2 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-6 active:opacity-70"
      onClick={onClick}
    >
      <span className="bg-teal/10 text-teal mb-1 flex size-11 items-center justify-center rounded-full">
        <InviteIcon className="size-[18px] fill-current" />
      </span>
      <span className="text-[15px] font-semibold">Neues Mitglied einladen</span>
      <span className="text-muted-foreground text-[13px]">
        Per QR-Code, Link, WhatsApp oder E-Mail
      </span>
    </button>
  )
}

type MembersPageProps = {
  readonly listId: string
}

/**
 * Members of one list, always visible — the tab toggle from
 * design/pure/invite.html was dropped. Below them, the owner sees their
 * friends as one-tap candidates; inviting strangers lives on its own
 * screen, reached through the CTA card.
 */
export function MembersPage({ listId }: MembersPageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const members = useAppSelector((state) => selectListMembers(state, listId))
  const me = useAppSelector(selectAuthUser)
  const friends = useAppSelector(selectFriends)
  const maxMembers = useAppSelector(selectMaxMembers)
  const isFull = useAppSelector((state) => selectListIsFull(state, listId))
  const toast = useToast()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly id: string
    readonly name: string
  } | null>(null)

  const isOwner = me !== null && list?.ownerId === me.userId

  // Friends who are not on this list yet — the one-tap candidates.
  const candidates = friends.filter(
    (friend) => !members.some((member) => member.id === friend.id),
  )

  const handleAddFriend = (friendId: string, name: string) => {
    setAddingId(friendId)
    void addMemberToList(listId, friendId, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
      .then(async () => {
        // The server wrote listMemberAdded; the fold arrives with the pull.
        await syncEngine.requestSync()
        toast.show(`${name} hinzugefügt`)
      })
      .catch((error: unknown) => {
        console.warn('adding the friend failed', error)
        toast.show(
          String(error).includes('409')
            ? 'Die Liste ist voll'
            : 'Hinzufügen fehlgeschlagen',
        )
      })
      .finally(() => setAddingId(null))
  }

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
      <PageHeader
        title="Mitglieder"
        backLabel="Zurück"
        onBack={() => void navigate({ to: '/lists' })}
      />

      <div className="mx-5 flex flex-col gap-2.5">
        {members.map((member) => {
          const name = memberDisplayName(member, me)
          const isMe = me !== null && member.id === me.userId
          return (
            <MemberCard
              key={member.id}
              memberId={member.id}
              name={name}
              role={`${member.isOwner ? 'Admin' : 'Mitglied'}${isMe ? ' · Du' : ''}`}
              isOwnerRole={member.isOwner}
              onRemove={
                isOwner && !isMe
                  ? () => setPendingRemoval({ id: member.id, name })
                  : null
              }
            />
          )
        })}

        {isOwner && candidates.length > 0 && (
          <>
            <div className="text-muted-foreground mt-4 mb-0.5 pl-1 text-xs font-semibold tracking-wider uppercase">
              Deine Freunde
            </div>
            {candidates.map((friend) => {
              const name = friend.name ?? MEMBER_NAME_FALLBACK
              return (
                <FriendCandidateRow
                  key={friend.id}
                  friendId={friend.id}
                  name={name}
                  disabled={isFull || addingId !== null}
                  onAdd={() => handleAddFriend(friend.id, name)}
                />
              )
            })}
          </>
        )}

        {isFull && (
          <div className="text-muted-foreground mt-3 text-center text-[13px] font-medium">
            Liste ist voll ({members.length} von {maxMembers})
          </div>
        )}

        {isOwner && !isFull && (
          <InviteCta
            onClick={() =>
              void navigate({ to: '/lists/$listId/invite', params: { listId } })
            }
          />
        )}
      </div>

      <DangerConfirmDialog
        open={pendingRemoval !== null}
        title={`${pendingRemoval?.name} entfernen?`}
        message={`${pendingRemoval?.name} hat dann keinen Zugriff mehr auf diese Einkaufsliste.`}
        confirmLabel="Entfernen"
        onConfirm={handleConfirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />

      {toast.element}
    </div>
  )
}
