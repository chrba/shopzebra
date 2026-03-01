import { Button } from '@/components/ui/button'

/** Silhouette avatar used for the profile button. */
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  )
}

/** Material "add" icon for the create-list button. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

type ListsHeaderProps = {
  readonly title: string
  readonly onAdd: () => void
  readonly onProfile: () => void
}

/**
 * Top bar of the lists overview with title, add-button and profile-button.
 * @param props.title Header text displayed in the center.
 * @param props.onAdd Called when the "+" button is tapped.
 * @param props.onProfile Called when the profile avatar is tapped.
 */
export function ListsHeader({ title, onAdd, onProfile }: ListsHeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-5 pt-4 pb-5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={onProfile}
        aria-label="Profil"
      >
        <PersonIcon />
      </Button>

      <h1 className="font-display text-foreground text-2xl font-extrabold tracking-[-0.3px]">
        {title}
      </h1>

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-teal"
        onClick={onAdd}
        aria-label="Neue Liste erstellen"
      >
        <PlusIcon />
      </Button>
    </header>
  )
}
