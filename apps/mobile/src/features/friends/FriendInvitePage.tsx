import { useNavigate } from '@tanstack/react-router'
import { InviteShare } from '../../components/InviteShare'
import type { FriendInvite } from './friendCommands'
import { Button } from '../../components/ui/button'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  )
}

type FriendInvitePageProps = {
  readonly invite: FriendInvite | null
}

/**
 * Mints and shares the caller's friendship link (screen 3 of the friends
 * proposal). Accepting it writes both address books — no list involved.
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
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={goBack}
        >
          <BackIcon />
          Zurück
        </Button>
        <h1 className="font-display text-[17px] font-bold">Freund einladen</h1>
        <div className="w-[70px]" />
      </header>

      <InviteShare
        link={inviteLink}
        invitationText={`Werde mein Freund bei ShopZebra, dann teilen wir Einkaufslisten mit einem Tap: ${inviteLink}`}
        mailSubject="Freundschaftseinladung zu ShopZebra"
      />
    </div>
  )
}
