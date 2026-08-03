import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import {
  listRenamed,
  selectListById,
  selectListMembers,
} from '../domain/listsSlice'
import {
  listPreferencesSet,
  selectListPreferences,
} from '../../preferences/domain/preferencesSlice'
import { ListEditor } from './ListEditor'
import { ShareWithRow } from '../../sharing/ShareWithRow'
import { memberDisplayName } from '../../sharing/memberDisplayName'
import {
  selectCurrentUserId,
  selectIdentity,
} from '../../auth/domain/authSlice'

type EditListPageProps = {
  readonly listId: string
}

/**
 * Page for editing an existing shopping list: name and local preferences.
 * The "Teilen mit" row shows the current members; the plus circle leads
 * to the members screen, where invites are minted and members removed.
 * @param props.listId ID of the shopping list to edit, from the route params.
 */
export function EditListPage({ listId }: EditListPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const preferences = useAppSelector((state) =>
    selectListPreferences(state, listId),
  )
  const members = useAppSelector((state) => selectListMembers(state, listId))
  const me = useAppSelector(selectIdentity)
  const currentUserId = useAppSelector(selectCurrentUserId)

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
      extraSection={
        <ShareWithRow
          members={members
            .filter((member) => member.id !== currentUserId)
            .map((member) => ({
              id: member.id,
              label: memberDisplayName(member, me),
            }))}
          onInvite={() =>
            void navigate({
              to: '/lists/$listId/members',
              params: { listId },
            })
          }
        />
      }
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
