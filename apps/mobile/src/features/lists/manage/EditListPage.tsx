import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { listRenamed, selectListById } from '../domain/listsSlice'
import {
  listPreferencesSet,
  selectListPreferences,
} from '../../preferences/domain/preferencesSlice'
import { ListEditor } from './ListEditor'

type EditListPageProps = {
  readonly listId: string
}

/**
 * Page for editing an existing shopping list: name and local preferences.
 * Members are managed via invites (owner model), not through this form.
 * @param props.listId ID of the shopping list to edit, from the route params.
 */
export function EditListPage({ listId }: EditListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const preferences = useAppSelector((state) =>
    selectListPreferences(state, listId),
  )

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
        emoji: preferences?.emoji ?? '\u{1F6D2}',
        name: list.name,
        color: preferences?.color ?? 'green',
      }}
      onSubmit={(result) => {
        dispatch(listRenamed({ listId, name: result.name }))
        dispatch(
          listPreferencesSet({
            listId,
            preferences: { color: result.color, emoji: result.emoji },
          }),
        )
        navigate({ to: '/lists' })
      }}
    />
  )
}
