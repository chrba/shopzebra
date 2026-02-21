import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import {
  selectAllLists,
  selectListCount,
  selectTotalItemCount,
  listDeleted,
} from './listsSlice'
import { ListsHeader } from './ListsHeader'
import { SummaryChips } from './SummaryChips'
import { ListTile } from './ListTile'
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

type DeleteTarget = {
  readonly id: string
  readonly name: string
}

export function ListsPage() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const lists = useAppSelector(selectAllLists)
  const listCount = useAppSelector(selectListCount)
  const totalItemCount = useAppSelector(selectTotalItemCount)

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
        listCount={listCount}
        itemCount={totalItemCount}
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
            <ListTile
              list={list}
              onClick={() => {}}
              onEdit={() =>
                navigate({ to: '/lists/$listId/edit', params: { listId: list.id } })
              }
            />
          </SwipeToDelete>
        ))}
        <Card
          className="hover:border-teal hover:bg-teal/5 min-h-[180px] cursor-pointer items-center justify-center gap-2 border-dashed bg-white/[0.06]"
          role="button"
          tabIndex={0}
          onClick={goToCreateList}
        >
          <div className="bg-secondary border-border flex size-12 items-center justify-center rounded-full border">
            <svg viewBox="0 0 24 24" className="fill-teal size-6">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </div>
          <span className="text-muted-foreground text-[13px] font-semibold">
            Neue Liste
          </span>
        </Card>
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) handleCancelDelete()
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Liste löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchtest du &ldquo;{deleteTarget?.name}&rdquo; wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
