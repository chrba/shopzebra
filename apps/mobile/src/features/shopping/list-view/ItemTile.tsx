import { cn } from '@/lib/utils'
import { useLongPress } from '../useLongPress'
import type { ItemGroup } from './itemGroups'

/** Small pencil in the tile corner — shown only when a note exists. */
function NoteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="fill-muted-foreground size-3 opacity-35"
    >
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
    </svg>
  )
}

type ItemTileProps = {
  readonly group: ItemGroup
  readonly checked: boolean
  /** Initial shown bottom-left when another member added the item. */
  readonly foreignInitial: string | null
  readonly onTap: () => void
  readonly onLongPress: () => void
}

/**
 * One product tile in the shopping grid. Tap checks off (or restores),
 * holding opens the detail sheet.
 */
export function ItemTile({
  group,
  checked,
  foreignInitial,
  onTap,
  onLongPress,
}: ItemTileProps) {
  const pressHandlers = useLongPress(onLongPress, onTap)

  return (
    <button
      type="button"
      {...pressHandlers}
      className={cn(
        'bg-card border-border relative flex min-h-[100px] flex-col items-center justify-center gap-1 rounded-2xl border p-2 transition-all select-none active:scale-95',
        checked && 'opacity-45',
      )}
    >
      {group.hasNote && (
        <span className="absolute top-1.5 right-1.5">
          <NoteIcon />
        </span>
      )}
      {foreignInitial !== null && (
        <span className="text-muted-foreground absolute bottom-1.5 left-1.5 text-[10px] font-bold">
          {foreignInitial}
        </span>
      )}
      <span className="text-3xl leading-none">{group.emoji}</span>
      <span
        className={cn(
          'text-[12px] leading-tight font-semibold',
          checked && 'line-through',
        )}
      >
        {group.name}
      </span>
      <span className="text-muted-foreground text-[10px] font-medium">
        {group.statusLine}
      </span>
    </button>
  )
}
