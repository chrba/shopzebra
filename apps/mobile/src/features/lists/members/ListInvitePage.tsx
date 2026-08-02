import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectListById } from '../domain/listsSlice'
import { InvitePage } from '../../sharing/InvitePage'
import type { Invite } from '../../sharing/memberCommands'

type ListInvitePageProps = {
  readonly listId: string
  readonly invite: Invite | null
}

/**
 * The shared invite screen, worded for a shopping list.
 * @param props.listId Which list is being shared (from the route).
 * @param props.invite The active token, or null when minting was refused.
 */
export function ListInvitePage({ listId, invite }: ListInvitePageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))

  return (
    <InvitePage
      invite={invite}
      deniedMessage="Der Einladungslink konnte nicht geladen werden. Nur der Besitzer der Liste kann einladen."
      invitationText={(link) =>
        `Komm in meine Einkaufsliste "${list?.name ?? ''}" bei ShopZebra: ${link}`
      }
      onBack={() =>
        void navigate({ to: '/lists/$listId/members', params: { listId } })
      }
    />
  )
}
