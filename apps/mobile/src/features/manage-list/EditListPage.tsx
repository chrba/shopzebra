import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../app/store'
import { listUpdated, selectListById } from '../lists/listsSlice'
import { ListEditor } from './ListEditor'

type EditListPageProps = {
  readonly listId: string
}

export function EditListPage({ listId }: EditListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))

  if (!list) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-muted-foreground">Liste nicht gefunden</p>
      </div>
    )
  }

  return (
    <ListEditor
      title="Liste bearbeiten"
      submitLabel="Speichern"
      initialValues={{
        emoji: list.emoji,
        name: list.name,
        color: list.color,
        selectedMembers: list.members.map((m) => m.letter),
      }}
      onSubmit={(result) => {
        dispatch(
          listUpdated({
            listId,
            name: result.name,
            emoji: result.emoji,
            color: result.color,
            members: result.members,
          }),
        )
        navigate({ to: '/lists' })
      }}
    />
  )
}
