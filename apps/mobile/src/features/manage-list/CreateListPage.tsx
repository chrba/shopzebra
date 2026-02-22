import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch } from '../../app/store'
import { listCreated } from '../lists/state/listsSlice'
import { ListEditor } from './ListEditor'

const DEFAULT_VALUES = {
  emoji: '\u{1F6D2}',
  name: '',
  color: 'green' as const,
  selectedMembers: ['M', 'P'],
}

export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  return (
    <ListEditor
      title="Neue Liste"
      submitLabel="Liste erstellen"
      initialValues={DEFAULT_VALUES}
      onSubmit={(result) => {
        dispatch(
          listCreated({
            id: crypto.randomUUID(),
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
