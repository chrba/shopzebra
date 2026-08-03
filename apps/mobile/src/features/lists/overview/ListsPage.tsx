import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectInitialSyncDone } from '../../../app/appSlice'
import { listDeleted, selectAllLists } from '../domain/listsSlice'
import { leaveList } from '../domain/leaveList'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'
import { MEMBER_NAME_FALLBACK, memberDisplayName } from '../../sharing/memberDisplayName'
import { selectFriendCount } from '../../friends/domain/friendsSlice'
import { selectCurrentUserId, selectIdentity } from '../../auth/domain/authSlice'
import { selectItemCountByListId } from '../../shopping/domain/shoppingSlice'
import { selectAllListPreferences } from '../../preferences/domain/preferencesSlice'
import type { AccentColor } from '../../preferences/domain/preferencesDomain'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListSummaryCard } from './ListSummaryCard'
import { SwipeAction } from '../../../components/SwipeAction'
import { DangerConfirmDialog } from '../../../components/DangerConfirmDialog'
import { useToast } from '../../../components/Toast'
import { ListCardSkeleton } from './ListsPageSkeleton'
import { Card } from '@/components/ui/card'

// --- Helpers ---

const COLORS: readonly AccentColor[] = [
  'green',
  'blue',
  'red',
  'purple',
  'yellow',
]

function hashOf(id: string): number {
  let hash = 0
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

// Deterministic defaults derived from the id — no stored state, no null checks
// (architecture/domain-model.md §3). Member display names arrive later via
// server-written listMemberAdded events; until then the id provides the letter.
function defaultColor(id: string): AccentColor {
  return COLORS[hashOf(id) % COLORS.length] ?? 'green'
}

/** A list the user asked to get rid of — the verb depends on whose it is. */
type PartingTarget = {
  readonly id: string
  readonly name: string
  readonly isOwn: boolean
}

// --- Private components ---

/** Material "add" icon (+ in a circle-free style). */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="fill-teal size-6">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

/** Dashed placeholder card at the end of the grid that creates a new list on tap. */
function CreateListCard({ onClick }: { readonly onClick: () => void }) {
  return (
    <Card
      className="hover:border-teal hover:bg-teal/5 min-h-[180px] cursor-pointer items-center justify-center gap-2 border-dashed bg-white/[0.06]"
      role="button"
      tabIndex={0}
      onClick={onClick}
    >
      <div className="bg-secondary border-border flex size-12 items-center justify-center rounded-full border">
        <PlusIcon />
      </div>
      <span className="text-muted-foreground text-[13px] font-semibold">
        Neue Liste
      </span>
    </Card>
  )
}

/**
 * Confirmation before a list disappears — with the words of whichever act
 * it is: deleting hits everyone, leaving only this device.
 */
function PartingDialog({
  target,
  onConfirm,
  onCancel,
}: {
  readonly target: PartingTarget | null
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  const isOwn = target?.isOwn ?? true
  return (
    <DangerConfirmDialog
      open={target !== null}
      title={isOwn ? 'Liste löschen?' : 'Liste verlassen?'}
      message={
        isOwn ? (
          <>
            &ldquo;{target?.name}&rdquo; wird für <strong>alle Mitglieder</strong>{' '}
            gelöscht und kann nicht wiederhergestellt werden.
          </>
        ) : (
          <>
            &ldquo;{target?.name}&rdquo; verschwindet von deinem Gerät. Die
            anderen behalten sie, und du kannst jederzeit wieder eingeladen
            werden.
          </>
        )
      }
      confirmLabel={isOwn ? 'Löschen' : 'Verlassen'}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}

// --- Page ---

/** Main overview screen showing all shopping lists as a 2-column grid. */
export function ListsPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const shoppingLists = useAppSelector(selectAllLists)
  const preferences = useAppSelector(selectAllListPreferences)
  const itemCountByListId = useAppSelector(selectItemCountByListId)
  const initialSyncDone = useAppSelector(selectInitialSyncDone)
  const me = useAppSelector(selectIdentity)
  const currentUserId = useAppSelector(selectCurrentUserId)
  const friendCount = useAppSelector(selectFriendCount)
  const toast = useToast()

  const lists = shoppingLists.map((list) => {
    const prefs = preferences[list.id]
    const isOwn = list.ownerId === currentUserId
    return {
      id: list.id,
      name: list.name,
      isOwn,
      // Only a foreign list names its owner; my own would state the obvious.
      ownerName: isOwn
        ? null
        : (list.memberNames?.[list.ownerId] ?? MEMBER_NAME_FALLBACK),
      color: prefs?.color ?? defaultColor(list.id),
      emoji: prefs?.emoji ?? '\u{1F6D2}',
      itemCount: itemCountByListId[list.id] ?? 0,
      // Own membership is a given — the circles show who else is on the
      // list, so an empty row plus the invite circle reads as "share this".
      members: list.memberIds
        .filter((memberId) => memberId !== currentUserId)
        .map((memberId) => ({
        id: memberId,
        initial: memberInitial(
          memberDisplayName(
            { id: memberId, name: list.memberNames?.[memberId] ?? null },
            me,
          ),
        ),
        color: memberAvatarColor(memberId),
        })),
    }
  })

  const showSyncSkeleton = lists.length === 0 && !initialSyncDone

  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null)
  const [partingTarget, setPartingTarget] = useState<PartingTarget | null>(null)

  const goToCreateList = () => navigate({ to: '/lists/new' })
  const goToProfile = () => navigate({ to: '/profile' })

  const closeParting = () => {
    setPartingTarget(null)
    setOpenSwipeId(null)
  }

  // Deleting is mine to do and takes the list from everyone; leaving only
  // ends my own membership and needs the server's yes first.
  const handleConfirmParting = () => {
    const target = partingTarget
    closeParting()
    if (!target) return

    if (target.isOwn) {
      dispatch(listDeleted({ listId: target.id }))
      return
    }
    void dispatch(leaveList(target.id)).catch((error: unknown) => {
      console.warn('leaving the list failed', error)
      toast.show('Verlassen fehlgeschlagen')
    })
  }

  return (
    <div className="min-h-screen pb-[100px]">
      <ListsHeader
        title="Meine Listen"
        onAdd={goToCreateList}
        onProfile={goToProfile}
      />
      <SummaryChips
        listCount={lists.length}
        itemCount={0}
        memberCount={friendCount}
        onMembersClick={() => navigate({ to: '/friends' })}
      />
      <div className="grid grid-cols-2 gap-3 px-5">
        {showSyncSkeleton &&
          [0, 1, 2, 3].map((index) => (
            <ListCardSkeleton key={index} delayMs={index * 150} />
          ))}
        {lists.map((list) => (
          <SwipeAction
            key={list.id}
            isOpen={openSwipeId === list.id}
            onOpen={() => setOpenSwipeId(list.id)}
            onClose={() => setOpenSwipeId(null)}
            label={list.isOwn ? 'Löschen' : 'Verlassen'}
            tone={list.isOwn ? 'destructive' : 'parting'}
            onTrigger={() =>
              setPartingTarget({
                id: list.id,
                name: list.name,
                isOwn: list.isOwn,
              })
            }
          >
            <ListSummaryCard
              list={list}
              onClick={() =>
                navigate({ to: '/lists/$listId', params: { listId: list.id } })
              }
              onEdit={() =>
                navigate({
                  to: '/lists/$listId/edit',
                  params: { listId: list.id },
                })
              }
              onManageMembers={() =>
                navigate({
                  to: '/lists/$listId/members',
                  params: { listId: list.id },
                })
              }
            />
          </SwipeAction>
        ))}
        {!showSyncSkeleton && <CreateListCard onClick={goToCreateList} />}
      </div>

      <PartingDialog
        target={partingTarget}
        onConfirm={handleConfirmParting}
        onCancel={closeParting}
      />

      {toast.element}
    </div>
  )
}
