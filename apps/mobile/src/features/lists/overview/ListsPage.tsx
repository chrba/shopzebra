import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectInitialSyncDone } from '../../../app/appSlice'
import { listDeleted, selectAllLists } from '../domain/listsSlice'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'
import { memberDisplayName } from '../members/memberDisplayName'
import { selectFriendCount } from '../../friends/domain/friendsSlice'
import { selectAuthUser } from '../../auth/domain/authSlice'
import { selectItemCountByListId } from '../../shopping/domain/shoppingSlice'
import { selectAllListPreferences } from '../../preferences/domain/preferencesSlice'
import type { ListColor } from '../../preferences/domain/preferencesDomain'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListSummaryCard } from './ListSummaryCard'
import { SwipeToDelete } from '../../../components/SwipeToDelete'
import { ListCardSkeleton } from './ListsPageSkeleton'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// --- Helpers ---

const COLORS: readonly ListColor[] = [
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
function defaultColor(id: string): ListColor {
  return COLORS[hashOf(id) % COLORS.length] ?? 'green'
}

type DeleteTarget = {
  readonly id: string
  readonly name: string
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

/** Confirmation dialog shown before permanently deleting a list. */
function DeleteListDialog({
  target,
  onConfirm,
  onCancel,
}: {
  readonly target: DeleteTarget | null
  readonly onConfirm: () => void
  readonly onCancel: () => void
}) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Liste löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Möchtest du &ldquo;{target?.name}&rdquo; wirklich löschen? Diese
            Aktion kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const me = useAppSelector(selectAuthUser)
  const friendCount = useAppSelector(selectFriendCount)

  const lists = shoppingLists.map((list) => {
    const prefs = preferences[list.id]
    return {
      id: list.id,
      name: list.name,
      color: prefs?.color ?? defaultColor(list.id),
      emoji: prefs?.emoji ?? '\u{1F6D2}',
      itemCount: itemCountByListId[list.id] ?? 0,
      // Own membership is a given — the circles show who else is on the
      // list, so an empty row plus the invite circle reads as "share this".
      members: list.memberIds
        .filter((memberId) => memberId !== me?.userId)
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
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const goToCreateList = () => navigate({ to: '/lists/new' })
  const goToProfile = () => navigate({ to: '/profile' })

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      dispatch(listDeleted({ listId: deleteTarget.id }))
    }
    setDeleteTarget(null)
    setOpenSwipeId(null)
  }

  const handleCancelDelete = () => {
    setDeleteTarget(null)
    setOpenSwipeId(null)
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
          <SwipeToDelete
            key={list.id}
            isOpen={openSwipeId === list.id}
            onOpen={() => setOpenSwipeId(list.id)}
            onClose={() => setOpenSwipeId(null)}
            onDelete={() => setDeleteTarget({ id: list.id, name: list.name })}
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
          </SwipeToDelete>
        ))}
        {!showSyncSkeleton && <CreateListCard onClick={goToCreateList} />}
      </div>

      <DeleteListDialog
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  )
}
