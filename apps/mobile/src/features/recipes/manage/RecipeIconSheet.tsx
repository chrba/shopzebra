import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  EMOJI_CATEGORIES,
  emojisMatching,
  type EmojiChoice,
} from './recipeEmojiCatalog'

type RecipeIconSheetProps = {
  readonly onPick: (emoji: string) => void
  readonly onClose: () => void
}

/**
 * Bottom sheet for picking a recipe's icon, per the recipe-workflow
 * prototype: a search box, one pill per category, and the icons of the
 * active category below. Searching looks across all categories at once.
 * @param props.onPick Called with the chosen emoji; the sheet closes after.
 * @param props.onClose Called when the user dismisses the sheet.
 */
export function RecipeIconSheet({ onPick, onClose }: RecipeIconSheetProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(
    EMOJI_CATEGORIES[0]?.name ?? '',
  )

  const searching = search.trim() !== ''
  const shown: readonly EmojiChoice[] = searching
    ? emojisMatching(search)
    : (EMOJI_CATEGORIES.find((category) => category.name === activeCategory)
        ?.choices ?? [])

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="bg-card fixed inset-x-0 bottom-0 z-50 max-h-[70vh] rounded-t-[28px] border-t border-zinc-800 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto mt-3 h-1 w-9 rounded-full bg-white/20" />

        <div className="flex items-center justify-between px-6 pt-4 pb-3">
          <span className="font-display text-[17px] font-bold">
            Icon wählen
          </span>
          <Button
            variant="ghost"
            className="text-muted-foreground h-auto px-2 py-1 text-lg"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </Button>
        </div>

        <div className="px-6 pb-3">
          <Input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Suchen… z.B. Pizza, Curry"
            className="h-auto rounded-2xl px-4 py-3 text-[15px]"
          />
        </div>

        {!searching && (
          <div className="flex gap-2 overflow-x-auto px-6 pb-3">
            {EMOJI_CATEGORIES.map((category) => (
              <Button
                key={category.name}
                variant="ghost"
                onClick={() => setActiveCategory(category.name)}
                className={cn(
                  'h-auto shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold',
                  category.name === activeCategory
                    ? 'text-teal bg-[rgba(78,157,166,0.14)]'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {category.name}
              </Button>
            ))}
          </div>
        )}

        <div className="max-h-[38vh] overflow-y-auto px-6 pb-6">
          {shown.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-[13px]">
              Kein passendes Icon gefunden
            </p>
          ) : (
            <div className="grid grid-cols-6 gap-2">
              {shown.map((choice) => (
                <Button
                  key={choice.emoji}
                  variant="ghost"
                  onClick={() => {
                    onPick(choice.emoji)
                    onClose()
                  }}
                  className="bg-secondary flex aspect-square h-auto w-full items-center justify-center rounded-2xl p-0 text-2xl"
                >
                  {choice.emoji}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
