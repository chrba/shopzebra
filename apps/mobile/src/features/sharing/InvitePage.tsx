import { useRouter } from '@tanstack/react-router'
import { InviteShare } from '../../components/InviteShare'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/ui/button'
import type { Invite } from './memberCommands'

/**
 * Why this screen has a link — or why it has none. The two reasons need
 * different words and different exits: not being the owner is final, a
 * failed request is worth another try.
 */
export type InviteState =
  | { readonly status: 'ready'; readonly invite: Invite }
  | { readonly status: 'notOwner' }
  | { readonly status: 'unreachable' }

type InvitePageProps = {
  readonly state: InviteState
  /** The sentence sent along with the link, e.g. "Komm in meine Liste …". */
  readonly invitationText: (link: string) => string
  /** Why only the owner may invite, in the words of this aggregate kind. */
  readonly notOwnerMessage: string
  readonly onBack: () => void
}

/** Centred message with a way out — both dead ends share this shape. */
function InviteNotice({
  message,
  actionLabel,
  onAction,
}: {
  readonly message: string
  readonly actionLabel: string
  readonly onAction: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="text-muted-foreground text-[15px] leading-relaxed">
        {message}
      </p>
      <Button
        className="h-auto rounded-2xl px-6 py-3 text-[15px] font-semibold"
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

/**
 * The invite half of design/pure/invite.html, on its own screen since the
 * tab toggle was dropped. Reached from the members screen's CTA card, and
 * shared by every aggregate kind — only the wording differs.
 *
 * Reached only with an identity: the route creates the account on the way,
 * while the pending skeleton is up.
 */
export function InvitePage({
  state,
  invitationText,
  notOwnerMessage,
  onBack,
}: InvitePageProps) {
  const router = useRouter()

  if (state.status === 'notOwner') {
    return (
      <InviteNotice message={notOwnerMessage} actionLabel="Zurück" onAction={onBack} />
    )
  }

  if (state.status === 'unreachable') {
    return (
      <InviteNotice
        message="Der Einladungslink konnte nicht geladen werden. Prüf deine Verbindung und versuch es noch einmal."
        actionLabel="Erneut versuchen"
        onAction={() => void router.invalidate()}
      />
    )
  }

  const inviteLink = `${window.location.origin}/join/${state.invite.token}`

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
