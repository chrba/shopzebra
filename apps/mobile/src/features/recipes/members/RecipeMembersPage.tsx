import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../../app/store'
import { selectRecipeById, selectRecipeMembers } from '../domain/recipesSlice'
import { selectMaxMembers } from '../../lists/domain/listsSlice'
import { selectRecipePreferences } from '../../preferences/domain/preferencesSlice'
import { DEFAULT_RECIPE_EMOJI } from '../manage/recipeEmojiCatalog'
import { MembersPage } from '../../sharing/MembersPage'

type RecipeMembersPageProps = {
  readonly recipeId: string
}

/**
 * The shared members screen, fed from the recipes slice — a recipe is
 * shared exactly like a list (architecture/sharing-model.md), so only the
 * aggregate and the nouns differ.
 *
 * The member cap is one server-wide number and arrives with whichever
 * collection was fetched last, so it is read from where it already lives.
 * @param props.recipeId Which recipe's members to show (from the route).
 */
export function RecipeMembersPage({ recipeId }: RecipeMembersPageProps) {
  const navigate = useNavigate()
  const recipe = useAppSelector((state) => selectRecipeById(state, recipeId))
  const members = useAppSelector((state) =>
    selectRecipeMembers(state, recipeId),
  )
  const maxMembers = useAppSelector(selectMaxMembers)
  const preferences = useAppSelector((state) =>
    selectRecipePreferences(state, recipeId),
  )

  return (
    <MembersPage
      aggregate={{ kind: 'recipe', id: recipeId }}
      subject={{
        name: recipe?.name ?? '',
        // The same icon the collection tile wears.
        emoji: preferences?.emoji ?? DEFAULT_RECIPE_EMOJI,
      }}
      ownerId={recipe?.ownerId ?? null}
      members={members}
      maxMembers={maxMembers}
      wording={{
        missing: 'Dieses Rezept gibt es nicht mehr.',
        full: 'Rezept ist voll',
      }}
      onBack={() =>
        void navigate({ to: '/recipes/$recipeId', params: { recipeId } })
      }
      onInvite={() =>
        void navigate({ to: '/recipes/$recipeId/invite', params: { recipeId } })
      }
    />
  )
}
