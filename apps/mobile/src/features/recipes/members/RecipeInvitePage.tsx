import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectRecipeById } from '../domain/recipesSlice'
import { InvitePage } from '../../sharing/InvitePage'
import type { Invite } from '../../sharing/memberCommands'

type RecipeInvitePageProps = {
  readonly recipeId: string
  readonly invite: Invite | null
}

/**
 * The shared invite screen, worded for a recipe.
 * @param props.recipeId Which recipe is being shared (from the route).
 * @param props.invite The active token, or null when minting was refused.
 */
export function RecipeInvitePage({ recipeId, invite }: RecipeInvitePageProps) {
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))

  return (
    <InvitePage
      invite={invite}
      deniedMessage="Der Einladungslink konnte nicht geladen werden. Nur der Besitzer des Rezepts kann einladen."
      invitationText={(link) =>
        `Koch mit mir "${recipe?.name ?? ''}" bei ShopZebra: ${link}`
      }
      onBack={() =>
        void navigate({ to: '/recipes/$recipeId/members', params: { recipeId } })
      }
    />
  )
}
