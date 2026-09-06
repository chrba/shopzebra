import { describe, expect, it } from 'vitest'
import {
  recipesReducer,
  recipesLoaded,
  recipeCreated,
  recipeUpdated,
  recipeDeleted,
  recipeMemberAdded,
  recipeMemberRemoved,
  recipeOwnerNamesLoaded,
  selectAllRecipes,
  selectRecipeById,
  selectRecipeMembers,
} from '@/features/recipes/domain/recipesSlice'
import type { PayloadAction } from '@/app/createSlice'

type RecipesState = ReturnType<typeof recipesReducer>

/** Drives the reducer the way the app does: actions in, selectors out. */
function fold(actions: readonly PayloadAction<unknown>[]) {
  const state = actions.reduce<RecipesState>(
    (current, action) => recipesReducer(current, action),
    recipesReducer(undefined, { type: '@@INIT' }),
  )
  return { recipes: state }
}

function created(recipeId: string, name = 'Spaghetti Bolognese') {
  return recipeCreated({
    recipeId,
    name,
    ownerId: 'mama',
    portions: 4,
    durationMinutes: 30,
    ingredients: [{ name: 'Spaghetti', quantity: '500', unit: 'g' }],
    steps: ['Wasser aufsetzen'],
  })
}

describe('recipes', () => {
  it('a created recipe shows up in the collection, owned by its creator', () => {
    const state = fold([created('bolo')])

    const recipes = selectAllRecipes(state)
    expect(recipes).toHaveLength(1)
    expect(recipes[0]?.name).toBe('Spaghetti Bolognese')
    expect(recipes[0]?.ownerId).toBe('mama')
    expect(selectRecipeMembers(state, 'bolo')).toEqual([
      { id: 'mama', name: null, isOwner: true },
    ])
  })

  it('the same recipeCreated twice does not create a second recipe', () => {
    const state = fold([created('bolo'), created('bolo')])

    expect(selectAllRecipes(state)).toHaveLength(1)
  })

  it('editing a recipe replaces what the form holds', () => {
    const state = fold([
      created('bolo'),
      recipeUpdated({
        recipeId: 'bolo',
        name: 'Bolognese XL',
        portions: 8,
        ingredients: [{ name: 'Spaghetti', quantity: '1000', unit: 'g' }],
        steps: ['Wasser aufsetzen', 'Sauce köcheln'],
      }),
    ])

    const recipe = selectRecipeById(state, 'bolo')
    expect(recipe?.name).toBe('Bolognese XL')
    expect(recipe?.portions).toBe(8)
    expect(recipe?.steps).toEqual(['Wasser aufsetzen', 'Sauce köcheln'])
  })

  it('clearing the preparation time removes it instead of keeping the old one', () => {
    const state = fold([
      created('bolo'),
      recipeUpdated({
        recipeId: 'bolo',
        name: 'Spaghetti Bolognese',
        portions: 4,
        ingredients: [],
        steps: [],
      }),
    ])

    expect(selectRecipeById(state, 'bolo')?.durationMinutes).toBeUndefined()
  })

  it('editing never drops the people a recipe is shared with', () => {
    const state = fold([
      created('bolo'),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
      recipeUpdated({
        recipeId: 'bolo',
        name: 'Bolognese XL',
        portions: 8,
        ingredients: [],
        steps: [],
      }),
    ])

    expect(
      selectRecipeMembers(state, 'bolo').map((member) => member.id),
    ).toEqual(['mama', 'tom'])
  })

  it('a deleted recipe is gone from the collection', () => {
    const state = fold([
      created('bolo'),
      created('lasagne', 'Lasagne'),
      recipeDeleted({ recipeId: 'bolo' }),
    ])

    expect(selectAllRecipes(state).map((recipe) => recipe.id)).toEqual([
      'lasagne',
    ])
  })

  it('an event for an unknown recipe changes nothing', () => {
    const state = fold([
      created('bolo'),
      recipeUpdated({
        recipeId: 'ghost',
        name: 'Geist',
        portions: 1,
        ingredients: [],
        steps: [],
      }),
      recipeDeleted({ recipeId: 'ghost' }),
      recipeMemberRemoved({ recipeId: 'ghost', memberId: 'tom' }),
    ])

    expect(selectAllRecipes(state)).toHaveLength(1)
    expect(selectRecipeById(state, 'bolo')?.name).toBe('Spaghetti Bolognese')
  })

  it('somebody who joined is a member and shows up by name', () => {
    const state = fold([
      created('bolo'),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
    ])

    expect(selectRecipeMembers(state, 'bolo')).toEqual([
      { id: 'mama', name: null, isOwner: true },
      { id: 'tom', name: 'Tom', isOwner: false },
    ])
  })

  it('joining twice does not list the same member twice', () => {
    const state = fold([
      created('bolo'),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
    ])

    expect(selectRecipeMembers(state, 'bolo')).toHaveLength(2)
  })

  it('a removed member loses both their place and their name', () => {
    const state = fold([
      created('bolo'),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
      recipeMemberRemoved({ recipeId: 'bolo', memberId: 'tom' }),
    ])

    expect(selectRecipeMembers(state, 'bolo')).toEqual([
      { id: 'mama', name: null, isOwner: true },
    ])
  })

  it("the owner's name arrives with the projection, not with an event", () => {
    const state = fold([
      created('bolo'),
      recipeOwnerNamesLoaded({ ownerNames: { bolo: 'Sarah' } }),
    ])

    expect(selectRecipeMembers(state, 'bolo')[0]?.name).toBe('Sarah')
  })

  it('hydration heals a store that already held a recipe twice', () => {
    const duplicate = {
      id: 'bolo',
      name: 'Spaghetti Bolognese',
      ownerId: 'mama',
      memberIds: ['mama'],
      portions: 4,
      ingredients: [],
      steps: [],
    }
    const state = fold([recipesLoaded({ recipes: [duplicate, duplicate] })])

    expect(selectAllRecipes(state)).toHaveLength(1)
  })

  it('folding the same events again yields the same collection', () => {
    const actions = [
      created('bolo'),
      recipeMemberAdded({ recipeId: 'bolo', memberId: 'tom', name: 'Tom' }),
      recipeUpdated({
        recipeId: 'bolo',
        name: 'Bolognese XL',
        portions: 8,
        ingredients: [],
        steps: [],
      }),
    ]

    expect(selectAllRecipes(fold(actions))).toEqual(
      selectAllRecipes(fold(actions)),
    )
  })

  it('an unknown recipe has no members rather than throwing', () => {
    expect(selectRecipeMembers(fold([]), 'ghost')).toEqual([])
    expect(selectRecipeById(fold([]), 'ghost')).toBeNull()
  })
})
