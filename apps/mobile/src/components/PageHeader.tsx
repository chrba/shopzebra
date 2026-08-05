import { Button } from './ui/button'

/** Chevron for the back button. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px] fill-current">
      <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  )
}

type PageHeaderProps = {
  readonly title: string
  /**
   * Shown before the title. Set it when the title is the name of a list or
   * recipe — the emoji is what makes it recognisable as that one.
   */
  readonly titleEmoji?: string
  /** Label next to the back chevron, e.g. "Listen" or "Zurück". */
  readonly backLabel: string
  readonly onBack: () => void
}

/**
 * The standard fullscreen-page header: back button, centered title, and a
 * spacer that keeps the title centered. Used by every screen without the
 * bottom navigation (profile, members, invites, friends).
 *
 * The title truncates rather than wraps — list names have no length limit,
 * and a two-line header would push everything below it out of place.
 */
export function PageHeader({
  title,
  titleEmoji,
  backLabel,
  onBack,
}: PageHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
      <Button
        variant="ghost"
        className="text-teal shrink-0 gap-1.5 px-0 text-[15px] font-semibold"
        onClick={onBack}
      >
        <BackIcon />
        {backLabel}
      </Button>
      <h1 className="font-display flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[17px] font-bold">
        {titleEmoji && (
          <span aria-hidden className="shrink-0 text-[18px]">
            {titleEmoji}
          </span>
        )}
        <span className="truncate">{title}</span>
      </h1>
      <div className="w-[70px] shrink-0" />
    </header>
  )
}
