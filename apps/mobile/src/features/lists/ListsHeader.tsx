import { Button } from '@/components/ui/button'

type ListsHeaderProps = {
  readonly title: string
  readonly onAdd: () => void
}

export function ListsHeader({ title, onAdd }: ListsHeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-5 pt-4 pb-5">
      <div className="size-8" />

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
        <svg viewBox="0 0 24 24" className="size-5 fill-current">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </Button>
    </header>
  )
}
