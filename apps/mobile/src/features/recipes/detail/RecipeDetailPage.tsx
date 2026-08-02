import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { selectRecipeById } from '../domain/recipesSlice'
import { scaleIngredients, type Ingredient } from '../domain/recipesDomain'
import {
  recipePreferencesSet,
  selectRecipePreferences,
} from '../../preferences/domain/preferencesSlice'
import { ingredientAmountOf } from '../manage/ingredientLine'
import { RecipeIconSheet } from '../manage/RecipeIconSheet'
import { DEFAULT_RECIPE_EMOJI } from '../manage/recipeEmojiCatalog'
import { Button } from '@/components/ui/button'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

/** The recipe's icon and name at the top; tapping the icon changes it. */
function RecipeHero({
  emoji,
  name,
  onPickIcon,
}: {
  readonly emoji: string
  readonly name: string
  readonly onPickIcon: () => void
}) {
  return (
    <div className="px-6 pt-2 text-center">
      <Button
        variant="ghost"
        onClick={onPickIcon}
        className="bg-secondary mx-auto flex size-24 items-center justify-center rounded-full p-0 text-5xl"
        aria-label="Icon wählen"
      >
        {emoji}
      </Button>
      <h2 className="font-display mt-4 text-2xl font-extrabold tracking-[-0.3px]">
        {name}
      </h2>
    </div>
  )
}

/** Portions and preparation time at a glance. */
function MetaChips({
  portions,
  durationMinutes,
}: {
  readonly portions: number
  readonly durationMinutes: number | undefined
}) {
  const chip =
    'bg-secondary text-muted-foreground rounded-full px-3.5 py-1.5 text-[13px] font-semibold'
  return (
    <div className="mt-4 flex justify-center gap-2">
      <span className={chip}>{portions} Portionen</span>
      {durationMinutes !== undefined && (
        <span className={chip}>{durationMinutes} Min</span>
      )}
    </div>
  )
}

/**
 * Dials the number of portions the quantities are shown for. Display only —
 * the recipe keeps the portions it was written for, so cooking for eight
 * tonight never changes what anybody else sees.
 */
function PortionStepper({
  portions,
  onChange,
}: {
  readonly portions: number
  readonly onChange: (portions: number) => void
}) {
  return (
    <div className="mt-6 flex items-center justify-center gap-6">
      <Button
        variant="ghost"
        disabled={portions <= 1}
        onClick={() => onChange(Math.max(1, portions - 1))}
        className="bg-secondary size-11 rounded-full p-0 text-xl font-bold"
        aria-label="Weniger Portionen"
      >
        −
      </Button>
      <div className="text-center">
        <div className="font-display text-3xl font-extrabold">{portions}</div>
        <div className="text-muted-foreground text-xs font-medium">
          Portionen
        </div>
      </div>
      <Button
        variant="ghost"
        onClick={() => onChange(portions + 1)}
        className="bg-secondary size-11 rounded-full p-0 text-xl font-bold"
        aria-label="Mehr Portionen"
      >
        +
      </Button>
    </div>
  )
}

/** What to buy, in the quantities for the portions currently dialled in. */
function IngredientList({
  ingredients,
}: {
  readonly ingredients: readonly Ingredient[]
}) {
  return (
    <section className="px-6 pt-8">
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        Zutaten
      </h3>
      <div className="bg-card divide-y divide-zinc-800 rounded-2xl border border-zinc-800">
        {ingredients.map((ingredient, index) => (
          <div key={index} className="flex gap-3 px-4 py-3">
            <span className="text-teal min-w-16 text-[15px] font-bold">
              {ingredientAmountOf(ingredient)}
            </span>
            <span className="text-[15px]">{ingredient.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** The numbered steps of cooking it. */
function PreparationSteps({ steps }: { readonly steps: readonly string[] }) {
  if (steps.length === 0) return null
  return (
    <section className="px-6 pt-6">
      <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
        Zubereitung
      </h3>
      <div className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="bg-secondary text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
              {index + 1}
            </div>
            <p className="text-[15px] leading-relaxed">{step}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

type RecipeDetailPageProps = {
  readonly recipeId: string
}

/**
 * One recipe: icon, name, portions and time, the ingredients scaled to the
 * portions currently dialled in, and the preparation steps. Follows
 * design/pure/recipe-workflow/recipe.html.
 * @param props.recipeId Which recipe to show (from the route).
 */
export function RecipeDetailPage({ recipeId }: RecipeDetailPageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))
  const preferences = useAppSelector((state) =>
    selectRecipePreferences(state, recipeId),
  )
  // Ephemeral view state: how many portions the cook is looking at now.
  const [portions, setPortions] = useState<number | null>(null)
  const [pickingIcon, setPickingIcon] = useState(false)

  if (!recipe) return null

  const shownPortions = portions ?? recipe.portions

  return (
    <div className="flex min-h-dvh flex-col pb-8">
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => navigate({ to: '/recipes' })}
        >
          <BackIcon />
          Rezepte
        </Button>
        <h1 className="font-display text-[17px] font-bold">Rezept</h1>
        <Button
          variant="ghost"
          className="text-teal px-0 text-[15px] font-semibold"
          onClick={() =>
            navigate({ to: '/recipes/$recipeId/edit', params: { recipeId } })
          }
        >
          Bearbeiten
        </Button>
      </header>

      <RecipeHero
        emoji={preferences?.emoji ?? DEFAULT_RECIPE_EMOJI}
        name={recipe.name}
        onPickIcon={() => setPickingIcon(true)}
      />
      <MetaChips
        portions={shownPortions}
        durationMinutes={recipe.durationMinutes}
      />
      <PortionStepper portions={shownPortions} onChange={setPortions} />
      <IngredientList
        ingredients={scaleIngredients(
          recipe.ingredients,
          recipe.portions,
          shownPortions,
        )}
      />
      <PreparationSteps steps={recipe.steps} />

      {pickingIcon && (
        <RecipeIconSheet
          onPick={(emoji) =>
            dispatch(
              recipePreferencesSet({
                recipeId,
                preferences: { color: preferences?.color ?? 'green', emoji },
              }),
            )
          }
          onClose={() => setPickingIcon(false)}
        />
      )}
    </div>
  )
}
