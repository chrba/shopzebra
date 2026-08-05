import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import {
  selectListById,
  selectListMembers,
  selectMaxMembers,
} from '../domain/listsSlice'
import { selectListPreferences } from '../../preferences/domain/preferencesSlice'
import { MembersPage } from '../../sharing/MembersPage'

const DEFAULT_LIST_EMOJI = '\u{1F6D2}'

type ListMembersPageProps = {
  readonly listId: string
}

/**
 * The shared members screen, fed from the lists slice. Everything about
 * sharing itself lives in features/sharing — this only says which
 * aggregate, and in which words.
 * @param props.listId Which list's members to show (from the route).
 */
export function ListMembersPage({ listId }: ListMembersPageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))
  const members = useAppSelector((state) => selectListMembers(state, listId))
  const maxMembers = useAppSelector(selectMaxMembers)
  const preferences = useAppSelector((state) =>
    selectListPreferences(state, listId),
  )

  return (
    <MembersPage
      aggregate={{ kind: 'list', id: listId }}
      subject={{
        name: list?.name ?? '',
        // The same emoji the overview tile wears, so the header reads as
        // that list and not as a new thing.
        emoji: preferences?.emoji ?? DEFAULT_LIST_EMOJI,
      }}
      ownerId={list?.ownerId ?? null}
      members={members}
      maxMembers={maxMembers}
      wording={{
        missing: 'Diese Liste gibt es nicht mehr.',
        full: 'Liste ist voll',
      }}
      onBack={() => void navigate({ to: '/lists' })}
      onInvite={() =>
        void navigate({ to: '/lists/$listId/invite', params: { listId } })
      }
    />
  )
}
