import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectRecipeById } from '../domain/recipesSlice'
import { InvitePage } from '../../sharing/InvitePage'
import type { InviteState } from '../../sharing/InvitePage'

type RecipeInvitePageProps = {
  readonly recipeId: string
  readonly state: InviteState
}

/**
 * The shared invite screen, worded for a recipe.
 * @param props.recipeId Which recipe is being shared (from the route).
 * @param props.state The active token, or why there is none.
 */
export function RecipeInvitePage({ recipeId, state }: RecipeInvitePageProps) {
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))

  return (
    <InvitePage
      state={state}
      notOwnerMessage="Nur der Besitzer des Rezepts kann einladen."
      invitationText={(link) =>
        `Koch mit mir "${recipe?.name ?? ''}" bei ShopZebra: ${link}`
      }
      onBack={() =>
        void navigate({
          to: '/recipes/$recipeId/members',
          params: { recipeId },
        })
      }
    />
  )
}
