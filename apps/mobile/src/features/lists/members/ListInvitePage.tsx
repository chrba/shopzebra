import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectListById } from '../domain/listsSlice'
import { InvitePage } from '../../sharing/InvitePage'
import type { InviteState } from '../../sharing/InvitePage'

type ListInvitePageProps = {
  readonly listId: string
  readonly state: InviteState
}

/**
 * The shared invite screen, worded for a shopping list.
 * @param props.listId Which list is being shared (from the route).
 * @param props.state The active token, or why there is none.
 */
export function ListInvitePage({ listId, state }: ListInvitePageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))

  return (
    <InvitePage
      state={state}
      notOwnerMessage="Nur der Besitzer der Liste kann einladen."
      invitationText={(link) =>
        `Komm in meine Einkaufsliste "${list?.name ?? ''}" bei ShopZebra: ${link}`
      }
      onBack={() =>
        void navigate({ to: '/lists/$listId/members', params: { listId } })
      }
    />
  )
}
