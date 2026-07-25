import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch } from '../../../app/store'
import { listCreated, listPreferencesSet } from '../domain/listsSlice'
import { FAMILY_MEMBERS } from '../domain/listsSlice'
import { ListEditor, type FamilyMember } from './ListEditor'

const familyMembersList: readonly FamilyMember[] = Object.entries(FAMILY_MEMBERS).map(
  ([id, member]) => ({ id, name: member.name, color: member.color }),
)

const DEFAULT_VALUES = {
  emoji: '\u{1F6D2}',
  name: '',
  color: 'green' as const,
  selectedMemberIds: ['mama', 'papa'],
}

/**
 * Page for creating a new shopping list.
 * Dispatches domain + preferences actions on submit.
 */
export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  return (
    <ListEditor
      title="Neue Liste"
      submitLabel="Liste erstellen"
      initialValues={DEFAULT_VALUES}
      familyMembers={familyMembersList}
      onSubmit={(result) => {
        const id = crypto.randomUUID()
        dispatch(
          listCreated({
            id,
            name: result.name,
            memberIds: result.memberIds,
          }),
        )
        dispatch(
          listPreferencesSet({
            listId: id,
            preferences: { color: result.color, emoji: result.emoji },
          }),
        )
        navigate({ to: '/lists' })
      }}
    />
  )
}
