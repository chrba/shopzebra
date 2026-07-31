import { useNavigate } from '@tanstack/react-router'
import { Button } from '../../../components/ui/button'

/**
 * Only ever rendered when redeeming failed — a successful join redirects
 * straight into the list from the route loader.
 */
export function JoinListPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="font-display text-[19px] font-bold">
        Einladung nicht gültig
      </h1>
      <p className="text-muted-foreground text-[15px] leading-relaxed">
        Dieser Einladungslink ist ungültig oder abgelaufen. Bitte lass dir
        einen neuen schicken.
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
