import { createSlice, type PayloadAction } from '../../../app/createSlice'
import { identityAttached } from '../../auth/domain/authSlice'
import { withRewrittenMembership } from '../../sharing/rewrittenMembership'
import type { Ingredient, Recipe } from './recipesDomain'

type RecipesState = {
  readonly recipes: readonly Recipe[]
}

// --- Slice ---
//
// Action payloads follow the wire format in services/events.md:
// the same object is Redux action, domain event and wire format.
// A recipe is owned and shared exactly like a list, so its member events
// mirror the list ones — written by the server, never dispatched locally.

const initialState: RecipesState = {
  recipes: [],
}

function withMember(
  state: RecipesState,
  recipeId: string,
  memberId: string,
  name: string,
): RecipesState {
  return {
    ...state,
    recipes: state.recipes.map((recipe) =>
      recipe.id === recipeId
        ? {
            ...recipe,
            memberIds: recipe.memberIds.includes(memberId)
              ? recipe.memberIds
              : [...recipe.memberIds, memberId],
            memberNames: { ...recipe.memberNames, [memberId]: name },
          }
        : recipe,
    ),
  }
}

function withoutMember(
  state: RecipesState,
  recipeId: string,
  memberId: string,
): RecipesState {
  return {
    ...state,
    recipes: state.recipes.map((recipe) => {
      if (recipe.id !== recipeId) return recipe
      const { [memberId]: _removed, ...remainingNames } =
        recipe.memberNames ?? {}
      return {
        ...recipe,
        memberIds: recipe.memberIds.filter((id) => id !== memberId),
        memberNames: remainingNames,
      }
    }),
  }
}

const recipesSlice = createSlice({
  name: 'recipes',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    recipesLoaded: {
      role: 'hydration',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{ readonly recipes: readonly Recipe[] }>,
      ): RecipesState => ({
        ...state,
        recipes: action.payload.recipes.filter(
          (recipe, index) =>
            action.payload.recipes.findIndex(
              (other) => other.id === recipe.id,
            ) === index,
        ),
      }),
    },

    // Opens the recipe's log: no membership exists yet, so it goes to the
    // collection endpoint, where the server bootstraps ownership for the
    // caller and appends this very event (services/events.md).
    recipeCreated: {
      role: 'event',
      opens: 'recipe',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly name: string
          readonly ownerId: string
          readonly portions: number
          readonly durationMinutes?: number
          readonly ingredients: readonly Ingredient[]
          readonly steps: readonly string[]
        }>,
      ): RecipesState => {
        // Reducer totality (architecture/sync-engine.md §5): the same
        // recipeCreated can be folded onto state that already holds the
        // recipe — appending blindly would duplicate it.
        if (
          state.recipes.some((recipe) => recipe.id === action.payload.recipeId)
        ) {
          return state
        }

        return {
          ...state,
          recipes: [
            ...state.recipes,
            {
              id: action.payload.recipeId,
              name: action.payload.name,
              ownerId: action.payload.ownerId,
              memberIds: [action.payload.ownerId],
              portions: action.payload.portions,
              ...(action.payload.durationMinutes === undefined
                ? {}
                : { durationMinutes: action.payload.durationMinutes }),
              ingredients: action.payload.ingredients,
              steps: action.payload.steps,
            },
          ],
        }
      },
    },

    // The editor saves the whole form as one intention. Membership is not
    // part of it — it travels in its own events and is never clobbered here.
    recipeUpdated: {
      role: 'event',
      on: 'recipe',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly name: string
          readonly portions: number
          readonly durationMinutes?: number
          readonly ingredients: readonly Ingredient[]
          readonly steps: readonly string[]
        }>,
      ): RecipesState => ({
        ...state,
        recipes: state.recipes.map((recipe) => {
          if (recipe.id !== action.payload.recipeId) return recipe
          // The previous duration is dropped rather than spread: clearing the
          // field in the editor has to clear it on the recipe too.
          const { durationMinutes: _previous, ...keptAsIs } = recipe
          return {
            ...keptAsIs,
            name: action.payload.name,
            portions: action.payload.portions,
            ingredients: action.payload.ingredients,
            steps: action.payload.steps,
            ...(action.payload.durationMinutes === undefined
              ? {}
              : { durationMinutes: action.payload.durationMinutes }),
          }
        }),
      }),
    },

    /**
     * Local-only: this device no longer holds the recipe — left, removed
     * by its owner, or deleted while I was away.
     */
    recipeDropped: {
      role: 'localEvent',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{ readonly recipeId: string }>,
      ): RecipesState => ({
        ...state,
        recipes: state.recipes.filter(
          (recipe) => recipe.id !== action.payload.recipeId,
        ),
      }),
    },

    recipeDeleted: {
      role: 'event',
      on: 'recipe',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{ readonly recipeId: string }>,
      ): RecipesState => ({
        ...state,
        recipes: state.recipes.filter(
          (recipe) => recipe.id !== action.payload.recipeId,
        ),
      }),
    },

    // Class-2 event: written by the server when someone redeems a recipe
    // invite. Never dispatched locally, so it only ever arrives through the
    // cursor catch-up with meta.remote.
    recipeMemberAdded: {
      role: 'event',
      on: 'recipe',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): RecipesState =>
        withMember(
          state,
          action.payload.recipeId,
          action.payload.memberId,
          action.payload.name,
        ),
    },

    // Class-2 event, counterpart of recipeMemberAdded.
    recipeMemberRemoved: {
      role: 'event',
      on: 'recipe',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
        }>,
      ): RecipesState =>
        withoutMember(state, action.payload.recipeId, action.payload.memberId),
    },

    // Local-only: the friend was tapped, the command is still travelling.
    // The row must appear now; if the server refuses, recipeMemberRemovedLocally
    // takes it back off. The real recipeMemberAdded arrives with the next pull.
    recipeMemberAddedLocally: {
      role: 'localEvent',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
          readonly name: string
        }>,
      ): RecipesState =>
        withMember(
          state,
          action.payload.recipeId,
          action.payload.memberId,
          action.payload.name,
        ),
    },

    // Local-only: the server already wrote recipeMemberRemoved (or refused an
    // add). Folding this now makes the row disappear one pull earlier; the
    // real event folds on top later and the reducer, being total, absorbs it.
    recipeMemberRemovedLocally: {
      role: 'localEvent',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly recipeId: string
          readonly memberId: string
        }>,
      ): RecipesState =>
        withoutMember(state, action.payload.recipeId, action.payload.memberId),
    },

    // Observation: comes from GET /recipes, not from a user action. The
    // owner's name has no event to travel in — they never trigger a member
    // event for themselves.
    recipeOwnerNamesLoaded: {
      role: 'observation',
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly ownerNames: Readonly<Record<string, string>>
        }>,
      ): RecipesState => ({
        ...state,
        recipes: state.recipes.map((recipe) => {
          const ownerName = action.payload.ownerNames[recipe.id]
          if (ownerName === undefined) return recipe
          return {
            ...recipe,
            memberNames: { ...recipe.memberNames, [recipe.ownerId]: ownerName },
          }
        }),
      }),
    },
  },
  extraReducers: [
    {
      creator: identityAttached,
      // Exactly as for a list: a recipe written before the account
      // existed belongs to that account afterwards.
      reducer: (
        state: RecipesState,
        action: PayloadAction<{
          readonly previousUserId: string
          readonly userId: string
        }>,
      ): RecipesState => ({
        ...state,
        recipes: state.recipes.map((recipe) => ({
          ...recipe,
          ...withRewrittenMembership(
            recipe,
            action.payload.previousUserId,
            action.payload.userId,
          ),
        })),
      }),
    },
  ],
})

// --- Actions ---

export const {
  recipesLoaded,
  recipeCreated,
  recipeUpdated,
  recipeDeleted,
  recipeMemberAdded,
  recipeDropped,
  recipeMemberRemoved,
  recipeMemberAddedLocally,
  recipeMemberRemovedLocally,
  recipeOwnerNamesLoaded,
} = recipesSlice.actions
export const recipesReducer = recipesSlice.reducer
export const recipesSyncDeclarations = recipesSlice.declarations

// --- Selectors ---

type StateWithRecipes = { readonly recipes: RecipesState }

export const selectAllRecipes = (state: StateWithRecipes) =>
  state.recipes.recipes

export const selectRecipeById = (state: StateWithRecipes, recipeId: string) =>
  state.recipes.recipes.find((recipe) => recipe.id === recipeId) ?? null

/**
 * Members of a recipe in join order, owner first. `name` is null when
 * nobody ever supplied one — the view decides what to show instead.
 */
export const selectRecipeMembers = (
  state: StateWithRecipes,
  recipeId: string,
): readonly {
  readonly id: string
  readonly name: string | null
  readonly isOwner: boolean
}[] => {
  const recipe = state.recipes.recipes.find(
    (candidate) => candidate.id === recipeId,
  )
  if (!recipe) return []
  return recipe.memberIds.map((memberId) => ({
    id: memberId,
    name: recipe.memberNames?.[memberId] ?? null,
    isOwner: memberId === recipe.ownerId,
  }))
}
