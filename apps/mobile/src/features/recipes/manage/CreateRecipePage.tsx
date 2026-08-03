import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import { recipeCreated } from '../domain/recipesSlice'
import { recipePreferencesSet } from '../../preferences/domain/preferencesSlice'
import { selectCurrentUserId } from '../../auth/domain/authSlice'
import { EMPTY_RECIPE, RecipeEditor } from './RecipeEditor'

/**
 * Page for writing a new recipe. Whoever uses this device becomes the owner
 * — others join later through an invite, exactly like a shopping list, and
 * no account is needed to write one.
 */
export function CreateRecipePage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const ownerId = useAppSelector(selectCurrentUserId)

  return (
    <RecipeEditor
      title="Neues Rezept"
      submitLabel="Rezept speichern"
      initialValues={EMPTY_RECIPE}
      onSubmit={(result) => {
        const recipeId = crypto.randomUUID()
        dispatch(
          recipeCreated({
            recipeId,
            name: result.name,
            ownerId,
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
            preferences: { color: 'green', emoji: result.emoji },
          }),
        )
        navigate({ to: '/recipes' })
      }}
    />
  )
}
