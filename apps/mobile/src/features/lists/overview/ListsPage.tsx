import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import {
  listDeleted,
  selectAllLists,
  selectAllListPreferences,
  FAMILY_MEMBERS,
  type ListColor,
} from '../domain/listsSlice'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListSummaryCard } from './ListSummaryCard'
import { SwipeToDelete } from './SwipeToDelete'
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

const COLORS: readonly ListColor[] = ['green', 'blue', 'red', 'purple', 'yellow']

function defaultColor(id: string): ListColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return COLORS[Math.abs(hash) % COLORS.length]!
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
            Möchtest du &ldquo;{target?.name}&rdquo; wirklich
            löschen? Diese Aktion kann nicht rückgängig gemacht
            werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={onConfirm}
          >
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

  const lists = shoppingLists.map((list) => {
    const prefs = preferences[list.id]
    return {
      id: list.id,
      name: list.name,
      color: prefs?.color ?? defaultColor(list.id),
      emoji: prefs?.emoji ?? '\u{1F6D2}',
      itemCount: 0,
      members: list.memberIds.map((id) => ({
        letter: FAMILY_MEMBERS[id]?.name[0] ?? '?',
        color: FAMILY_MEMBERS[id]?.color ?? '#888',
      })),
    }
  })

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
      <ListsHeader title="Meine Listen" onAdd={goToCreateList} onProfile={goToProfile} />
      <SummaryChips
        listCount={lists.length}
        itemCount={0}
        memberCount={0}
      />
      <div className="grid grid-cols-2 gap-3 px-5">
        {lists.map((list) => (
          <SwipeToDelete
            key={list.id}
            isOpen={openSwipeId === list.id}
            onOpen={() => setOpenSwipeId(list.id)}
            onClose={() => setOpenSwipeId(null)}
            onDelete={() =>
              setDeleteTarget({ id: list.id, name: list.name })
            }
          >
            <ListSummaryCard
              list={list}
              onClick={() => {}}
              onEdit={() =>
                navigate({ to: '/lists/$listId/edit', params: { listId: list.id } })
              }
            />
          </SwipeToDelete>
        ))}
        <CreateListCard onClick={goToCreateList} />
      </div>

      <DeleteListDialog
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  )
}
