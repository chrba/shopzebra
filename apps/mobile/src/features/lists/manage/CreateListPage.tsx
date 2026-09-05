import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { listCreated } from '../domain/listsSlice'
import { listPreferencesSet } from '../../preferences/domain/preferencesSlice'
import { selectCurrentUserId } from '../../auth/domain/authSlice'
import { ListEditor } from './ListEditor'

const DEFAULT_VALUES = {
  emoji: '\u{1F6D2}',
  name: '',
  color: 'green' as const,
}

/**
 * Page for creating a new shopping list. Whoever uses this device becomes
 * the owner (owner model — members join later via invites, never at
 * creation time). No account needed: the device's own id authors it from
 * the first start.
 */
export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const ownerId = useAppSelector(selectCurrentUserId)

  return (
    <ListEditor
      title="Neue Liste"
      submitLabel="Liste erstellen"
      initialValues={DEFAULT_VALUES}
      onSubmit={(result) => {
        const listId = crypto.randomUUID()
        dispatch(
          listCreated({
            listId,
            name: result.name,
            ownerId,
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
