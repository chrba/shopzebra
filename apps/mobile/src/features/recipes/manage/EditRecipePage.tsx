import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { recipeUpdated, selectRecipeById } from '../domain/recipesSlice'
import {
  recipePreferencesSet,
  selectRecipePreferences,
} from '../../preferences/domain/preferencesSlice'
import { RecipeEditor } from './RecipeEditor'
import { DEFAULT_RECIPE_EMOJI } from './recipeEmojiCatalog'

type EditRecipePageProps = {
  readonly recipeId: string
}

/**
 * Page for changing an existing recipe. Shares the form with creating one,
 * so both look and behave the same.
 *
 * Sharing is deliberately absent: who a recipe belongs to is decided in the
 * collection, on its tile. Editing is about the recipe itself.
 * @param props.recipeId Which recipe is being edited (from the route).
 */
export function EditRecipePage({ recipeId }: EditRecipePageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))
  const preferences = useAppSelector((state) =>
    selectRecipePreferences(state, recipeId),
  )
  // A recipe that was deleted on another device while this page was open.
  if (!recipe) return null

  return (
    <RecipeEditor
      title="Rezept bearbeiten"
      submitLabel="Speichern"
      initialValues={{
        emoji: preferences?.emoji ?? DEFAULT_RECIPE_EMOJI,
        name: recipe.name,
        portions: recipe.portions,
        durationMinutes: recipe.durationMinutes ?? null,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
      }}
      onSubmit={(result) => {
        dispatch(
          recipeUpdated({
            recipeId,
            name: result.name,
            portions: result.portions,
            ...(result.durationMinutes === null
              ? {}
              : { durationMinutes: result.durationMinutes }),
            ingredients: result.ingredients,
            steps: result.steps,
          }),
        )
        dispatch(
          recipePreferencesSet({
            recipeId,
            preferences: {
              color: preferences?.color ?? 'green',
              emoji: result.emoji,
            },
          }),
        )
        navigate({ to: '/recipes/$recipeId', params: { recipeId } })
      }}
    />
  )
}
