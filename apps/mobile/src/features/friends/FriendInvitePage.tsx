import { useNavigate } from '@tanstack/react-router'
import { InviteShare } from '../../components/InviteShare'
import { PageHeader } from '../../components/PageHeader'
import type { FriendInvite } from './friendCommands'
import { Button } from '../../components/ui/button'

type FriendInvitePageProps = {
  readonly invite: FriendInvite | null
}

/**
 * Mints and shares the caller's friendship link (screen 3 of the friends
 * proposal). Accepting it writes both address books — no list involved.
 * Reached only with an identity: the friends screen asks a nameless device
 * for a name first.
 */
export function FriendInvitePage({ invite }: FriendInvitePageProps) {
  const navigate = useNavigate()

  const goBack = () => void navigate({ to: '/friends' })

  if (!invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Der Einladungslink konnte nicht geladen werden. Bitte versuch es
          später noch einmal.
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

  const inviteLink = `${window.location.origin}/friend/${invite.token}`

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader title="Freund einladen" backLabel="Zurück" onBack={goBack} />

      <InviteShare
        link={inviteLink}
        invitationText={`Werde mein Freund bei ShopZebra, dann teilen wir Einkaufslisten mit einem Tap: ${inviteLink}`}
        mailSubject="Freundschaftseinladung zu ShopZebra"
      />
    </div>
  )
}
