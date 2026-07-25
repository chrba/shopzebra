import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { listUpdated, listPreferencesSet, selectListById, selectListPreferences } from '../domain/listsSlice'
import { FAMILY_MEMBERS } from '../domain/listsSlice'
import { ListEditor, type FamilyMember } from './ListEditor'

const familyMembersList: readonly FamilyMember[] = Object.entries(FAMILY_MEMBERS).map(
  ([id, member]) => ({ id, name: member.name, color: member.color }),
)

type EditListPageProps = {
  readonly listId: string
}

/**
 * Page for editing an existing shopping list.
 * Loads current values from domain + preferences.
 * @param props.listId ID of the shopping list to edit, from the route params.
 */
export function EditListPage({ listId }: EditListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const preferences = useAppSelector((state) => selectListPreferences(state, listId))

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
        selectedMemberIds: list.memberIds,
      }}
      familyMembers={familyMembersList}
      onSubmit={(result) => {
        dispatch(
          listUpdated({
            listId,
            name: result.name,
            memberIds: result.memberIds,
          }),
        )
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
