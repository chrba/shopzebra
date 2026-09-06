import { useState } from 'react'
import { store, useAppSelector } from '../../app/store'
import { selectDeviceId } from '../../app/appSlice'
import {
  selectCurrentUserId,
  selectDisplayName,
} from '../auth/domain/authSlice'
import { selectFriends } from '../friends/domain/friendsSlice'
import { memberAvatarColor, memberInitial } from '../lists/domain/memberAvatar'
import { MEMBER_NAME_FALLBACK, memberDisplayName } from './memberDisplayName'
import {
  addMember,
  refusedBecauseFull,
  memberAddedLocally,
  memberRemovedLocally,
  removeMember,
} from './memberCommands'
import type { Aggregate } from '../../app/sync/aggregate'
import { useToast } from '../../components/Toast'
import { InviteIcon } from '../../components/InviteIcon'
import { PageHeader } from '../../components/PageHeader'
import { SwipeAction } from '../../components/SwipeAction'

/** Coloured circle with the person's initial — the avatar of every row. */
function AvatarCircle({
  id,
  name,
}: {
  readonly id: string
  readonly name: string
}) {
  return (
    <div
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white"
      style={{ backgroundColor: memberAvatarColor(id) }}
    >
      {memberInitial(name)}
    </div>
  )
}

/** Introduces a group of rows, e.g. "Geteilt mit" or "Deine Freunde". */
function SectionLabel({ children }: { readonly children: string }) {
  return (
    <div className="text-muted-foreground mb-0.5 pl-1 text-xs font-semibold tracking-wider uppercase">
      {children}
    </div>
  )
}

type MemberCardProps = {
  readonly name: string
  readonly memberId: string
  readonly role: string
  readonly isOwnerRole: boolean
}

/** One member of the list: avatar, name, role line. */
function MemberCard({ name, memberId, role, isOwnerRole }: MemberCardProps) {
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
function FriendCandidateRow({
  name,
  friendId,
  disabled,
  onAdd,
}: FriendCandidateRowProps) {
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

/**
 * "1 Mitglied" / "3 Mitglieder". Currently unused: variant B names the list
 * in the header and no longer carries a count line.
 */
export function memberCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'Mitglied' : 'Mitglieder'}`
}

/** One person on the aggregate, as the screen needs them. */
export type SharedMember = {
  readonly id: string
  readonly name: string | null
  readonly isOwner: boolean
}

/**
 * The words that differ between a list and a recipe. Everything else about
 * sharing is identical, so only the nouns travel as data.
 */
export type SharingWording = {
  /** Shown when the aggregate is gone, e.g. "Diese Liste gibt es nicht mehr." */
  readonly missing: string
  /** Shown when the cap is reached, e.g. "Liste ist voll". */
  readonly full: string
}

/** The list or recipe this screen belongs to, as the header names it. */
export type SharedSubject = {
  readonly name: string
  /** The one from the overview tile, so the header reads as that thing. */
  readonly emoji: string
}

type MembersPageProps = {
  readonly aggregate: Aggregate
  readonly subject: SharedSubject
  /** Who owns it, or null when it no longer exists on this device. */
  readonly ownerId: string | null
  readonly members: readonly SharedMember[]
  readonly maxMembers: number | null
  readonly wording: SharingWording
  readonly onBack: () => void
  readonly onInvite: () => void
}

/**
 * Members of one shared thing — a list or a recipe — always visible; the
 * tab toggle from design/pure/invite.html was dropped. Below them, the
 * owner sees their friends as one-tap candidates; inviting strangers lives
 * on its own screen, reached through the CTA card.
 *
 * The screen knows nothing about which kind it is showing: the route hands
 * it the aggregate, its members and the few words that differ.
 */
export function MembersPage({
  aggregate,
  subject,
  ownerId,
  members,
  maxMembers,
  wording,
  onBack,
  onInvite,
}: MembersPageProps) {
  const currentUserId = useAppSelector(selectCurrentUserId)
  const displayName = useAppSelector(selectDisplayName)
  const viewer = { id: currentUserId, name: displayName }
  const friends = useAppSelector(selectFriends)
  const isFull = maxMembers !== null && members.length >= maxMembers
  const toast = useToast()
  // Which row currently shows its action zone — ephemeral UI state, so it
  // stays local (react-best-practices.md).
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)

  const isOwner = ownerId === currentUserId

  // Friends who are not on this list yet — the one-tap candidates.
  const candidates = friends.filter(
    (friend) => !members.some((member) => member.id === friend.id),
  )

  // The row appears on the tap; the command travels afterwards. If the
  // server refuses — full, or no longer friends — it is taken back off.
  const handleAddFriend = (friendId: string, name: string) => {
    store.dispatch(memberAddedLocally(aggregate, friendId, name))
    void addMember(aggregate, friendId, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    }).catch((error: unknown) => {
      console.warn('adding the friend failed', error)
      store.dispatch(memberRemovedLocally(aggregate, friendId))
      toast.show(
        refusedBecauseFull(error) ? wording.full : 'Hinzufügen fehlgeschlagen',
      )
    })
  }

  // No confirmation: removing somebody destroys nothing — the aggregate and
  // everything on it stay, that person just stops taking part.
  const handleRemove = (memberId: string, name: string) => {
    setOpenSwipeId(null)
    void removeMember(aggregate, memberId, {
      eventId: crypto.randomUUID(),
      deviceId: selectDeviceId(store.getState()),
    })
      .then(() => {
        // The server wrote the event; folding it here is what makes the row
        // disappear now instead of one round trip later.
        store.dispatch(memberRemovedLocally(aggregate, memberId))
        toast.show(`${name} wurde entfernt`)
      })
      .catch((error: unknown) => {
        console.warn('removing the member failed', error)
        toast.show('Entfernen fehlgeschlagen')
      })
  }

  if (ownerId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-8 text-center">
        <p className="text-muted-foreground text-[15px]">{wording.missing}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader
        title={subject.name}
        titleEmoji={subject.emoji}
        backLabel="Zurück"
        onBack={onBack}
      />

      <div className="mx-5 flex flex-col gap-2.5">
        <SectionLabel>Geteilt mit</SectionLabel>

        {members.map((member) => {
          const name = memberDisplayName(member, viewer)
          const isMe = member.id === currentUserId
          const card = (
            <MemberCard
              memberId={member.id}
              name={name}
              role={`${member.isOwner ? 'Admin' : 'Mitglied'}${isMe ? ' · Du' : ''}`}
              isOwnerRole={member.isOwner}
            />
          )

          // Only the owner removes anybody, and never themselves — leaving
          // is a different act and lives on the overview.
          if (!isOwner || isMe) return <div key={member.id}>{card}</div>

          return (
            <SwipeAction
              key={member.id}
              isOpen={openSwipeId === member.id}
              onOpen={() => setOpenSwipeId(member.id)}
              onClose={() => setOpenSwipeId(null)}
              label="Entfernen"
              tone="destructive"
              onTrigger={() => handleRemove(member.id, name)}
            >
              {card}
            </SwipeAction>
          )
        })}

        {isOwner && candidates.length > 0 && (
          <>
            <div className="mt-4">
              <SectionLabel>Deine Freunde</SectionLabel>
            </div>
            {candidates.map((friend) => {
              const name = friend.name ?? MEMBER_NAME_FALLBACK
              return (
                <FriendCandidateRow
                  key={friend.id}
                  friendId={friend.id}
                  name={name}
                  disabled={isFull}
                  onAdd={() => handleAddFriend(friend.id, name)}
                />
              )
            })}
          </>
        )}

        {isFull && (
          <div className="text-muted-foreground mt-3 text-center text-[13px] font-medium">
            {wording.full} ({members.length} von {maxMembers})
          </div>
        )}

        {isOwner && !isFull && <InviteCta onClick={onInvite} />}
      </div>

      {toast.element}
    </div>
  )
}
