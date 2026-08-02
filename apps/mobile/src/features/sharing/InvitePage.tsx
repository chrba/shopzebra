import { InviteShare } from '../../components/InviteShare'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/ui/button'
import type { Invite } from './memberCommands'

type InvitePageProps = {
  /** Null when the token could not be minted — usually: not the owner. */
  readonly invite: Invite | null
  /** The sentence sent along with the link, e.g. "Komm in meine Liste …". */
  readonly invitationText: (link: string) => string
  /** Why no link could be shown, in the words of this aggregate kind. */
  readonly deniedMessage: string
  readonly onBack: () => void
}

/**
 * The invite half of design/pure/invite.html, on its own screen since the
 * tab toggle was dropped. Reached from the members screen's CTA card, and
 * shared by every aggregate kind — only the wording differs.
 */
export function InvitePage({
  invite,
  invitationText,
  deniedMessage,
  onBack,
}: InvitePageProps) {
  if (!invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          {deniedMessage}
        </p>
        <Button
          className="h-auto rounded-2xl px-6 py-3 text-[15px] font-semibold"
          onClick={onBack}
        >
          Zurück
        </Button>
      </div>
    )
  }

  const inviteLink = `${window.location.origin}/join/${invite.token}`

  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader title="Einladen" backLabel="Zurück" onBack={onBack} />

      <InviteShare
        link={inviteLink}
        invitationText={invitationText(inviteLink)}
        mailSubject="Einladung zu ShopZebra"
      />
    </div>
  )
}
