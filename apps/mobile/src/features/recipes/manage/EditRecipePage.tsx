import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch, useAppSelector } from '../../../app/store'
import {
  recipeUpdated,
  selectRecipeById,
  selectRecipeMembers,
} from '../domain/recipesSlice'
import {
  selectCurrentUserId,
  selectIdentity,
} from '../../auth/domain/authSlice'
import { ShareWithRow } from '../../sharing/ShareWithRow'
import { memberDisplayName } from '../../sharing/memberDisplayName'
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
 * @param props.recipeId Which recipe is being edited (from the route).
 */
export function EditRecipePage({ recipeId }: EditRecipePageProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))
  const preferences = useAppSelector((state) =>
    selectRecipePreferences(state, recipeId),
  )
  const members = useAppSelector((state) =>
    selectRecipeMembers(state, recipeId),
  )
  const me = useAppSelector(selectIdentity)
  const currentUserId = useAppSelector(selectCurrentUserId)

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
      extraSection={
        <ShareWithRow
          members={members
            .filter((member) => member.id !== currentUserId)
            .map((member) => ({
              id: member.id,
              label: memberDisplayName(member, me),
            }))}
          onInvite={() =>
            void navigate({
              to: '/recipes/$recipeId/members',
              params: { recipeId },
            })
          }
        />
      }
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
