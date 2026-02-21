import {
  Card,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ShoppingList, ListColor } from './listsSlice'

type ListTileProps = {
  readonly list: ShoppingList
  readonly onClick: () => void
  readonly onEdit: () => void
}

const iconBgMap: Record<ListColor, string> = {
  green: 'bg-green-500/10 shadow-[0_0_20px_rgba(107,191,107,0.3)]',
  blue: 'bg-blue-500/10 shadow-[0_0_20px_rgba(91,168,213,0.3)]',
  red: 'bg-red-500/10 shadow-[0_0_20px_rgba(224,123,123,0.3)]',
  purple: 'bg-purple-500/10 shadow-[0_0_20px_rgba(160,123,204,0.3)]',
  yellow: 'bg-yellow-500/10 shadow-[0_0_20px_rgba(232,196,74,0.3)]',
}

function formatMembers(
  members: readonly { readonly letter: string }[],
): string {
  if (members.length === 0) return 'Privat'
  if (members.length === 1) return members[0]!.letter
  return `${members.length} Pers.`
}

export function ListTile({ list, onClick, onEdit }: ListTileProps) {
  return (
    <Card
      className="group relative cursor-pointer gap-0 rounded-2xl px-4 py-5 transition-all duration-[250ms] select-none active:scale-[0.97]"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
    >
      {list.badge && (
        <Badge className="bg-orange absolute top-3 right-3 z-2 text-[10px] font-bold text-white">
          {list.badge}
        </Badge>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute right-3 bottom-3 z-3 opacity-0 transition-opacity duration-200 group-hover:opacity-60 hover:opacity-100!"
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        aria-label="Liste bearbeiten"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
            fill="currentColor"
            className="text-muted-foreground"
          />
        </svg>
      </Button>

      <CardContent className="flex flex-col gap-2.5 px-0 py-0">
        <div
          className={`flex size-14 items-center justify-center rounded-full ${iconBgMap[list.color]}`}
        >
          <span className="text-4xl leading-none">{list.emoji}</span>
        </div>

        <CardTitle className="font-display text-[15px] leading-tight font-bold">
          {list.name}
        </CardTitle>

        <CardDescription className="flex items-center gap-2 text-xs font-medium">
          <span>{list.itemCount} Items</span>
          {list.members.length > 0 && (
            <>
              <span className="bg-muted-foreground size-[3px] rounded-full" />
              <span>{formatMembers(list.members)}</span>
            </>
          )}
        </CardDescription>
      </CardContent>

      {list.activity && (
        <CardFooter className="text-muted-foreground px-0 pt-2.5 text-[11px] leading-snug">
          <span className="text-secondary-foreground font-semibold">
            {list.activity.who}
          </span>{' '}
          {list.activity.what} &middot; {list.activity.when}
        </CardFooter>
      )}
    </Card>
  )
}
