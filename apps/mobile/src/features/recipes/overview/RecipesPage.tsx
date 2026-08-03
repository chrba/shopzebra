import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { recipeDeleted, selectAllRecipes } from '../domain/recipesSlice'
import { SwipeAction } from '../../../components/SwipeAction'
import { DangerConfirmDialog } from '../../../components/DangerConfirmDialog'
import { selectAllRecipePreferences } from '../../preferences/domain/preferencesSlice'
import { selectCurrentUserId, selectIdentity } from '../../auth/domain/authSlice'
import { memberAvatarColor, memberInitial } from '../../lists/domain/memberAvatar'
import { memberDisplayName } from '../../sharing/memberDisplayName'
import { DEFAULT_RECIPE_EMOJI } from '../manage/recipeEmojiCatalog'
import { Input } from '@/components/ui/input'
import { RecipeTile } from './RecipeTile'

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="fill-muted-foreground pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2"
    >
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="fill-teal size-6">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

/** Title and how many recipes are currently shown. */
function CollectionHeader({ count }: { readonly count: number }) {
  return (
    <header className="px-6 pt-6 pb-5 text-center">
      <h1 className="font-display text-2xl font-extrabold tracking-[-0.3px]">
        Meine Rezepte
      </h1>
      <p className="text-muted-foreground mt-1 text-[13px] font-medium">
        {count} {count === 1 ? 'Rezept' : 'Rezepte'}
      </p>
    </header>
  )
}

/** Narrows the grid to recipes whose name contains what was typed. */
function SearchField({
  value,
  onChange,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="px-5 pb-4">
      <div className="relative">
        <SearchIcon />
        <Input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Rezept suchen..."
          className="h-auto rounded-2xl py-3.5 pr-4 pl-11 text-sm font-medium"
        />
      </div>
    </div>
  )
}

/** The dashed tile that closes the grid and starts a new recipe. */
function NewRecipeTile() {
  return (
    <Link
      to="/recipes/new"
      className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-zinc-700 transition-transform active:scale-[0.97]"
    >
      <div className="bg-secondary flex size-12 items-center justify-center rounded-full border border-zinc-800">
        <PlusIcon />
      </div>
      <span className="text-muted-foreground text-[13px] font-semibold">
        Neues Rezept
      </span>
    </Link>
  )
}

/**
 * The recipe collection: a searchable grid of tiles with an "add" tile at
 * the end. Follows design/pure/recipe-workflow/recipes.html.
 */
export function RecipesPage() {
  const dispatch = useAppDispatch()
  const recipes = useAppSelector(selectAllRecipes)
  const preferences = useAppSelector(selectAllRecipePreferences)
  const me = useAppSelector(selectIdentity)
  const currentUserId = useAppSelector(selectCurrentUserId)
  // Ephemeral UI state — search term, which tile is swiped open and which
  // deletion is waiting for a confirmation all belong to this screen only.
  const [search, setSearch] = useState('')
  const [swipedRecipeId, setSwipedRecipeId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const pendingDelete = recipes.find((recipe) => recipe.id === pendingDeleteId)

  const term = search.trim().toLowerCase()
  const shown = term
    ? recipes.filter((recipe) => recipe.name.toLowerCase().includes(term))
    : recipes

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1 pb-6">
        <CollectionHeader count={shown.length} />

        <SearchField value={search} onChange={setSearch} />

        <div className="grid grid-cols-2 gap-3 px-5">
          {shown.map((recipe) => (
            <SwipeAction
              key={recipe.id}
              isOpen={swipedRecipeId === recipe.id}
              onOpen={() => setSwipedRecipeId(recipe.id)}
              onClose={() => setSwipedRecipeId(null)}
              label="Löschen"
              tone="destructive"
              onTrigger={() => {
                setSwipedRecipeId(null)
                setPendingDeleteId(recipe.id)
              }}
            >
              <RecipeTile
                recipeId={recipe.id}
                name={recipe.name}
                emoji={preferences[recipe.id]?.emoji ?? DEFAULT_RECIPE_EMOJI}
                color={preferences[recipe.id]?.color ?? 'green'}
                portions={recipe.portions}
                durationMinutes={recipe.durationMinutes}
                members={recipe.memberIds
                  .filter((memberId) => memberId !== currentUserId)
                  .map((memberId) => {
                    const label = memberDisplayName(
                      {
                        id: memberId,
                        name: recipe.memberNames?.[memberId] ?? null,
                      },
                      me,
                    )
                    return {
                      id: memberId,
                      initial: memberInitial(label),
                      color: memberAvatarColor(memberId),
                    }
                  })}
              />
            </SwipeAction>
          ))}

          <NewRecipeTile />
        </div>
      </div>

      <DangerConfirmDialog
        open={pendingDelete !== undefined}
        title="Rezept löschen?"
        message={
          <>
            „{pendingDelete?.name}" wird für alle gelöscht, die es sehen.
          </>
        }
        confirmLabel="Löschen"
        onConfirm={() => {
          if (pendingDeleteId) dispatch(recipeDeleted({ recipeId: pendingDeleteId }))
          setPendingDeleteId(null)
        }}
        onCancel={() => setPendingDeleteId(null)}
      />

    </div>
  )
}
