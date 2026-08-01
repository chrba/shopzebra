import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectListById } from '../domain/listsSlice'
import { InviteShare } from '../../../components/InviteShare'
import { PageHeader } from '../../../components/PageHeader'
import type { ListInvite } from './memberCommands'
import { Button } from '../../../components/ui/button'

type InvitePageProps = {
  readonly listId: string
  readonly invite: ListInvite | null
}

/**
 * The invite half of design/pure/invite.html, on its own screen since the
 * tab toggle was dropped. Reached from the members screen's CTA card.
 */
export function InvitePage({ listId, invite }: InvitePageProps) {
  const navigate = useNavigate()
  const list = useAppSelector((state) => selectListById(state, listId))

  const goBack = () =>
    void navigate({ to: '/lists/$listId/members', params: { listId } })

  if (!invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Der Einladungslink konnte nicht geladen werden. Nur der Besitzer der
          Liste kann einladen.
        </p>
        <Button
          className="h-auto rounded-2xl px-6 py-3 text-[15px] font-semibold"
          onClick={goBack}
        >
          Zurück
        </Button>
      </div>
    )
  }

  const inviteLink = `${window.location.origin}/join/${invite.token}`

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader title="Einladen" backLabel="Zurück" onBack={goBack} />

      <InviteShare
        link={inviteLink}
        invitationText={`Komm in meine Einkaufsliste "${list?.name ?? ''}" bei ShopZebra: ${inviteLink}`}
        mailSubject="Einladung zu ShopZebra"
      />
    </div>
  )
}
