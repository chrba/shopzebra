import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectIdentity } from '../../auth/domain/authSlice'
import {
  FirstShareNameSheet,
  needsNameBeforeSharing,
} from '../../sharing/FirstShareNameSheet'
import { joinWithToken, type JoinOutcome } from '../../sharing/joinWithToken'
import { Button } from '../../../components/ui/button'

type JoinListPageProps = {
  readonly token: string
  /**
   * What the route already tried. Null when it could not try at all — the
   * device has no identity yet, so the name sheet comes first.
   */
  readonly outcome: JoinOutcome | null
}

/**
 * The invitee's screen. A device that already has an account never sees
 * it: the route redeems the token in its loader and redirects straight
 * into the list. Without an account joining starts here — with a name,
 * not with a registration (accountless-first-planned.md).
 */
export function JoinListPage({ token, outcome }: JoinListPageProps) {
  const navigate = useNavigate()
  const identity = useAppSelector(selectIdentity)
  // Ephemeral UI state: what our own attempt led to, once the sheet
  // created the account. Null until then.
  const [outcomeAfterNaming, setOutcomeAfterNaming] =
    useState<JoinOutcome | null>(null)

  const settled = outcome ?? outcomeAfterNaming

  if (settled === null && needsNameBeforeSharing(identity)) {
    return (
      <FirstShareNameSheet
        confirmLabel="Beitreten"
        onDone={async () => {
          const joined = await joinWithToken(token)
          setOutcomeAfterNaming(joined)
          if (joined.status === 'joined') {
            await navigate({
              to: '/lists/$listId',
              params: { listId: joined.aggregate.id },
            })
          }
        }}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="font-display text-[19px] font-bold">
        {settled?.status === 'full'
          ? 'Diese Liste ist voll'
          : 'Einladung nicht gültig'}
      </h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed">
        {settled?.status === 'full'
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
