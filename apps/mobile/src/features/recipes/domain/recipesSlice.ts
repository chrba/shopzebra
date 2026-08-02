import { createSlice, type PayloadAction } from '../../../app/createSlice'
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

const recipesSlice = createSlice({
  name: 'recipes',
  synced: true,
  initialState,
  reducers: {
    // Local hydration from clientStorage — not a domain event.
    recipesLoaded: (
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

    recipeCreated: (
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
      if (state.recipes.some((recipe) => recipe.id === action.payload.recipeId)) {
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

    // The editor saves the whole form as one intention. Membership is not
    // part of it — it travels in its own events and is never clobbered here.
    recipeUpdated: (
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

    recipeDeleted: (
      state: RecipesState,
      action: PayloadAction<{ readonly recipeId: string }>,
    ): RecipesState => ({
      ...state,
      recipes: state.recipes.filter(
        (recipe) => recipe.id !== action.payload.recipeId,
      ),
    }),

    // Class-2 event: written by the server when someone redeems a recipe
    // invite. Never dispatched locally, so it only ever arrives through the
    // cursor catch-up with meta.remote.
    recipeMemberAdded: (
      state: RecipesState,
      action: PayloadAction<{
        readonly recipeId: string
        readonly memberId: string
        readonly name: string
      }>,
    ): RecipesState => ({
      ...state,
      recipes: state.recipes.map((recipe) =>
        recipe.id === action.payload.recipeId
          ? {
              ...recipe,
              memberIds: recipe.memberIds.includes(action.payload.memberId)
                ? recipe.memberIds
                : [...recipe.memberIds, action.payload.memberId],
              memberNames: {
                ...recipe.memberNames,
                [action.payload.memberId]: action.payload.name,
              },
            }
          : recipe,
      ),
    }),

    // Class-2 event, counterpart of recipeMemberAdded.
    recipeMemberRemoved: (
      state: RecipesState,
      action: PayloadAction<{
        readonly recipeId: string
        readonly memberId: string
      }>,
    ): RecipesState => ({
      ...state,
      recipes: state.recipes.map((recipe) => {
        if (recipe.id !== action.payload.recipeId) return recipe
        const { [action.payload.memberId]: _removed, ...remainingNames } =
          recipe.memberNames ?? {}
        return {
          ...recipe,
          memberIds: recipe.memberIds.filter(
            (memberId) => memberId !== action.payload.memberId,
          ),
          memberNames: remainingNames,
        }
      }),
    }),

    // Local-only: owner names from GET /recipes. Carries no recipeId at the
    // payload root, so needsSync() keeps it out of the outbox. The owner's
    // name has no event to travel in — they never trigger a member event
    // for themselves.
    recipeOwnerNamesLoaded: (
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
})

// --- Actions ---

export const {
  recipesLoaded,
  recipeCreated,
  recipeUpdated,
  recipeDeleted,
  recipeMemberAdded,
  recipeMemberRemoved,
  recipeOwnerNamesLoaded,
} = recipesSlice.actions
export const recipesReducer = recipesSlice.reducer

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
