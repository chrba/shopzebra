import { useNavigate } from '@tanstack/react-router'
import type { JoinOutcome } from '../../sharing/joinWithToken'
import { Button } from '../../../components/ui/button'

type JoinListPageProps = {
  /** What redeeming the token led to. */
  readonly outcome: JoinOutcome
}

/**
 * Only ever rendered when redeeming failed — a successful join redirects
 * straight into the list from the route loader.
 *
 * Nobody is asked for a name here any more: the invitee's device named
 * itself at its first start, and the route turns that name into an account
 * while the "Du trittst bei …" screen is up.
 */
export function JoinListPage({ outcome }: JoinListPageProps) {
  const navigate = useNavigate()
  const isFull = outcome.status === 'full'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="font-display text-[19px] font-bold">
        {isFull ? 'Diese Liste ist voll' : 'Einladung nicht gültig'}
      </h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed">
        {isFull
          ? 'Die Liste hat schon die maximale Anzahl an Mitgliedern. Bitte frag die Person, die dich eingeladen hat.'
          : 'Dieser Einladungslink ist ungültig oder abgelaufen. Bitte lass dir einen neuen schicken.'}
      </p>
      <Button
        className="mt-2 h-auto rounded-2xl px-6 py-3 text-[15px] font-semibold"
        onClick={() => void navigate({ to: '/lists' })}
      >
        Zu meinen Listen
      </Button>
    </div>
  )
}
