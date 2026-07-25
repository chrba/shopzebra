import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { listCreated } from '../domain/listsSlice'
import { listPreferencesSet } from '../../preferences/domain/preferencesSlice'
import { selectAuthUser } from '../../auth/domain/authSlice'
import { ListEditor } from './ListEditor'

const DEFAULT_VALUES = {
  emoji: '\u{1F6D2}',
  name: '',
  color: 'green' as const,
}

/**
 * Page for creating a new shopping list.
 * The signed-in user becomes the owner (owner model — members join
 * later via invites, never at creation time).
 */
export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const owner = useAppSelector(selectAuthUser)

  // The route guard (requireAuth) guarantees a signed-in user.
  if (!owner) return null

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
            ownerId: owner.userId,
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
