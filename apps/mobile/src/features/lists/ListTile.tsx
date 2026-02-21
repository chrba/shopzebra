import type { ShoppingList, ListColor } from './listsSlice'

type ListTileProps = {
  readonly list: ShoppingList
  readonly onClick: () => void
  readonly onEdit: () => void
}

const tileGlowMap: Record<ListColor, string> = {
  green: 'tile-glow-green',
  blue: 'tile-glow-blue',
  red: 'tile-glow-red',
  purple: 'tile-glow-purple',
  yellow: 'tile-glow-yellow',
}

const iconBgMap: Record<ListColor, string> = {
  green: 'icon-bg-green',
  blue: 'icon-bg-blue',
  red: 'icon-bg-red',
  purple: 'icon-bg-purple',
  yellow: 'icon-bg-yellow',
}

function formatMembers(members: readonly { readonly letter: string }[]): string {
  if (members.length === 0) return 'Privat'
  if (members.length === 1) return members[0]!.letter
  return `${members.length} Pers.`
}

export function ListTile({ list, onClick, onEdit }: ListTileProps) {
  return (
    <div
      className={`group relative flex flex-col gap-2.5 bg-card-bg border border-card-border rounded-tile py-5 px-4 cursor-pointer overflow-hidden card-blur transition-all duration-[250ms] select-none no-underline text-inherit active:scale-[0.97] tile-glow-base ${tileGlowMap[list.color]}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
    >
      {list.badge && (
        <span className="absolute top-3 right-3 bg-badge-bg text-badge-color text-[10px] font-bold px-2 py-[3px] rounded-[10px] z-2" style={{ border: 'var(--badge-border)', boxShadow: 'var(--badge-shadow)' }}>
          {list.badge}
        </span>
      )}

      <button
        className="absolute bottom-3 right-3 flex size-7 items-center justify-center rounded-lg bg-surface border border-surface-border z-3 opacity-0 transition-[opacity,background] duration-200 cursor-pointer p-0 group-hover:opacity-60 hover:opacity-100! hover:bg-surface-hover"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        type="button"
        aria-label="Liste bearbeiten"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            fill="var(--text-dim)"
          />
        </svg>
      </button>

      <div className={`relative z-1 flex size-14 items-center justify-center transition-[border-radius] duration-300 ${iconBgMap[list.color]}`} style={{ borderRadius: 'var(--icon-radius)' }}>
        <span className="relative z-1 text-4xl leading-none">{list.emoji}</span>
      </div>

      <div className="relative z-1 font-display text-[15px] font-bold text-text-primary leading-tight">{list.name}</div>

      <div className="relative z-1 flex items-center gap-2">
        <span className="text-xs font-medium text-text-dim">{list.itemCount} Items</span>
        {list.members.length > 0 && (
          <>
            <span className="size-[3px] rounded-full bg-text-dim" />
            <span className="text-xs font-medium text-text-dim">{formatMembers(list.members)}</span>
          </>
        )}
      </div>

      {list.activity && (
        <div className="relative z-1 text-[11px] text-text-dim leading-snug">
          <span className="text-text-secondary font-semibold">{list.activity.who}</span>{' '}
          {list.activity.what} &middot; {list.activity.when}
        </div>
      )}
    </div>
  )
}
