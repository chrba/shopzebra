// Route tree and app bootstrap.
//
// The root route's beforeLoad runs once on startup: it restores the
// identity (if this device already has one), loads persisted lists from
// clientStorage, hydrates the Redux store and opens the local event log —
// all before any component renders.
//
// There are no auth guards: the app is fully usable without an account
// (architecture/accountless-first-planned.md). An identity is created at
// the first share or join, and only then does anything reach the server.

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth'
import { store } from './store'
import {
  listsLoaded,
  memberLimitLoaded,
  ownerNamesLoaded,
  selectListById,
} from '../features/lists/domain/listsSlice'
import {
  friendIntentRestored,
  joinIntentRestored,
} from '../features/lists/join/joinIntentSlice'
import {
  FRIEND_INTENT_KEY,
  JOIN_INTENT_KEY,
} from '../features/lists/join/joinIntentClientStorageHandler'
import { friendsLoaded, friendsRestored } from '../features/friends/domain/friendsSlice'
import { FRIENDS_STORAGE_KEY } from '../features/friends/domain/friendsClientStorageHandler'
import { createFriendInvite, fetchFriends } from '../features/friends/friendCommands'
import { FriendsPage } from '../features/friends/FriendsPage'
import { FriendInvitePage } from '../features/friends/FriendInvitePage'
import { AcceptFriendPage } from '../features/friends/AcceptFriendPage'
import {
  fetchInvite,
  fetchSharingProjection,
} from '../features/sharing/memberCommands'
import { joinWithToken } from '../features/sharing/joinWithToken'
import { ListMembersPage } from '../features/lists/members/ListMembersPage'
import { ListInvitePage } from '../features/lists/members/ListInvitePage'
import { RecipeMembersPage } from '../features/recipes/members/RecipeMembersPage'
import { RecipeInvitePage } from '../features/recipes/members/RecipeInvitePage'
import { JoinListPage } from '../features/lists/join/JoinListPage'
import { shoppingLoaded } from '../features/shopping/domain/shoppingSlice'
import { SHOPPING_STORAGE_KEY } from '../features/shopping/domain/shoppingClientStorageHandler'
import {
  listPreferencesLoaded,
  recipePreferencesLoaded,
} from '../features/preferences/domain/preferencesSlice'
import type { RecipePreferences } from '../features/preferences/domain/preferencesDomain'
import {
  recipeOwnerNamesLoaded,
  recipesLoaded,
  selectRecipeById,
} from '../features/recipes/domain/recipesSlice'
import { RecipesPage } from '../features/recipes/overview/RecipesPage'
import { CreateRecipePage } from '../features/recipes/manage/CreateRecipePage'
import { EditRecipePage } from '../features/recipes/manage/EditRecipePage'
import { RecipeDetailPage } from '../features/recipes/detail/RecipeDetailPage'
import { RECIPES_KEY } from '../features/recipes/domain/recipesClientStorageHandler'
import { RECIPE_PREFS_KEY } from '../features/preferences/domain/preferencesClientStorageHandler'
import type { Recipe } from '../features/recipes/domain/recipesDomain'
import {
  guestIdentityCreated,
  linkedIdentityRestored,
  selectCurrentUserId,
  selectHasIdentity,
  type EstablishedIdentity,
} from '../features/auth/domain/authSlice'
import { restoredIdentity } from '../features/auth/domain/restoredIdentity'
import {
  ensureShadowAccount,
  loadShadowCredentials,
} from '../features/auth/domain/shadowAccount'
import { appLoaded, selectIsAppLoaded } from './appSlice'
import { openLocalLog, startSync } from './sync/startSync'
import { getItem, setItem } from './clientStorage'
import type { ShoppingList } from '../features/lists/domain/listsDomain'
import type { ListPreferences } from '../features/preferences/domain/preferencesDomain'
import { RootLayout } from './RootLayout'
import { ListsPage } from '../features/lists/overview/ListsPage'
import { ListsPageSkeleton } from '../features/lists/overview/ListsPageSkeleton'
import { CreateListPage } from '../features/lists/manage/CreateListPage'
import { EditListPage } from '../features/lists/manage/EditListPage'
import { ShoppingListPage } from '../features/shopping/list-view/ShoppingListPage'
import { CategoryPage } from '../features/shopping/category/CategoryPage'
import { ProfilePage } from '../features/auth/profile/ProfilePage'

const DEVICE_ID_KEY = 'shopzebra_device_id'
const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

/** Parsed JSON from client storage, or null when absent or damaged. */
async function storedJson(key: string): Promise<unknown> {
  const raw = await getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** The confirmed recipes this device last saw. Empty on a fresh install. */
async function storedRecipes(): Promise<readonly Recipe[]> {
  const parsed = await storedJson(RECIPES_KEY)
  return Array.isArray(parsed) ? (parsed as readonly Recipe[]) : []
}

/** Emoji and colour per recipe — per-device, never synced. */
async function storedRecipePreferences(): Promise<{
  readonly [recipeId: string]: RecipePreferences
}> {
  const parsed = await storedJson(RECIPE_PREFS_KEY)
  return parsed !== null && typeof parsed === 'object'
    ? (parsed as { readonly [recipeId: string]: RecipePreferences })
    : {}
}

/** A claim of the id token, or undefined when it is absent or not text. */
function textClaim(claim: unknown): string | undefined {
  return typeof claim === 'string' ? claim : undefined
}

/** How this session was authenticated, as the `identities` claim reports it. */
function providerOfSession(identitiesClaim: unknown): string | undefined {
  if (!Array.isArray(identitiesClaim)) return undefined
  const first: unknown = identitiesClaim[0]
  if (typeof first !== 'object' || first === null) return undefined
  const providerName =
    'providerName' in first ? textClaim(first.providerName) : undefined
  return providerName?.toLowerCase()
}

/** Who the live Amplify session belongs to, or null when there is none. */
async function identityOfSession(): Promise<EstablishedIdentity | null> {
  try {
    const cognitoUser = await getCurrentUser()
    const session = await fetchAuthSession()
    const claims = session.tokens?.idToken?.payload ?? {}
    return restoredIdentity(cognitoUser.userId, {
      email: textClaim(claims.email),
      name: textClaim(claims.name),
      provider: providerOfSession(claims.identities),
    })
  } catch {
    return null
  }
}

/**
 * Signs the stored shadow credentials back in. Reached when this device
 * has an account but no session — the token cache was cleared, or the
 * refresh token expired.
 */
async function identityOfStoredCredentials(): Promise<EstablishedIdentity | null> {
  if ((await loadShadowCredentials()) === null) return null
  try {
    await ensureShadowAccount()
    return await identityOfSession()
  } catch (error: unknown) {
    // Offline at boot: stay local, the outbox holds everything.
    console.warn('signing the shadow account back in failed', error)
    return null
  }
}

/**
 * Puts the identity of a returning device back into the store. Called once
 * per app start, before anything renders. A device that never shared has
 * no identity — that is a normal state here, not a failure.
 */
async function restoreIdentity(): Promise<void> {
  const restored =
    (await identityOfSession()) ?? (await identityOfStoredCredentials())
  if (restored === null) return

  store.dispatch(
    restored.kind === 'linked'
      ? linkedIdentityRestored(restored)
      : guestIdentityCreated({
          userId: restored.userId,
          name: restored.name,
        }),
  )
}

/**
 * The binary rule for the direct-fetch commands: a device without an
 * identity has no session, so every read would come back 401. The screens
 * behind these loaders show the name sheet instead.
 */
function canReachServer(): boolean {
  return selectHasIdentity(store.getState())
}

const rootRoute = createRootRoute({
  component: RootLayout,
  beforeLoad: async () => {
    // The bootstrap below runs once per app start. beforeLoad fires on
    // every navigation, so later runs bail out immediately — this also
    // keeps the pending skeleton from flashing on in-app navigations.
    if (selectIsAppLoaded(store.getState())) return

    // 1. Restore the identity. A live Amplify session wins; stored shadow
    //    credentials without one mean the token cache was cleared — sign in
    //    again silently. Neither: the device stays local, which is a normal
    //    state here, not an error.
    await restoreIdentity()

    // 2. Load persisted lists + preferences (local-first: rendered
    // immediately, the sync engine catches up with the server log in
    // the background once startSync() runs below).
    const rawLists = await getItem(LISTS_KEY)
    const rawPreferences = await getItem(PREFS_KEY)

    let lists: readonly ShoppingList[] = []
    let preferences: { readonly [listId: string]: ListPreferences } = {}

    if (rawLists) {
      try {
        const parsed: unknown = JSON.parse(rawLists)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Lists persisted before the owner model lack ownerId —
          // fall back to the first member.
          const stored = parsed as readonly Partial<ShoppingList>[]
          lists = stored.flatMap((entry) =>
            entry.id && entry.name
              ? [
                  {
                    id: entry.id,
                    name: entry.name,
                    ownerId: entry.ownerId ?? entry.memberIds?.[0] ?? 'unknown',
                    memberIds: entry.memberIds ?? [],
                  },
                ]
              : [],
          )
        }
      } catch {
        // ignore malformed data
      }
    }

    if (rawPreferences && Object.keys(preferences).length === 0) {
      try {
        const parsed: unknown = JSON.parse(rawPreferences)
        if (parsed && typeof parsed === 'object') {
          preferences = parsed as { readonly [listId: string]: ListPreferences }
        }
      } catch {
        // ignore malformed data
      }
    }

    // 3. Load or create device ID
    let deviceId = await getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      await setItem(DEVICE_ID_KEY, deviceId)
    }

    // 4. Hydrate lists + shopping items from clientStorage
    const rawShopping = await getItem(SHOPPING_STORAGE_KEY)
    if (rawShopping) {
      try {
        const parsed: unknown = JSON.parse(rawShopping)
        if (parsed && typeof parsed === 'object') {
          store.dispatch(
            shoppingLoaded(parsed as Parameters<typeof shoppingLoaded>[0]),
          )
        }
      } catch {
        // ignore malformed data
      }
    }
    store.dispatch(listsLoaded({ lists }))

    store.dispatch(listPreferencesLoaded(preferences))

    // Recipes hydrate the same way lists do — local-first, then catch-up.
    store.dispatch(recipesLoaded({ recipes: await storedRecipes() }))
    store.dispatch(recipePreferencesLoaded(await storedRecipePreferences()))
    // A pending invite has to survive an app kill — the invitee leaves for
    // the mail app to fetch the confirmation code.
    store.dispatch(
      joinIntentRestored({ token: await getItem(JOIN_INTENT_KEY) }),
    )
    store.dispatch(
      friendIntentRestored({ token: await getItem(FRIEND_INTENT_KEY) }),
    )
    const rawFriends = await getItem(FRIENDS_STORAGE_KEY)
    if (rawFriends) {
      try {
        const parsed: unknown = JSON.parse(rawFriends)
        if (Array.isArray(parsed)) {
          store.dispatch(
            friendsRestored({
              friends: parsed as Parameters<
                typeof friendsRestored
              >[0]['friends'],
            }),
          )
        }
      } catch {
        // ignore malformed data
      }
    }
    store.dispatch(appLoaded({ theme: 'dark', deviceId }))

    // 5. Open the local event log: the queued events of this device go
    // back into the reducer's pending queue, with or without an account.
    await openLocalLog()

    // 6. Local-first boot: the store above is hydrated from clientStorage
    // and rendered immediately. With an identity the sync engine now
    // catches up with the server log in the background — no await, so
    // the app never blocks the first render on network. Without one this
    // is a no-op: the log stays on the device.
    startSync()
  },
})

// --- App routes — reachable without an account ---

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/lists' })
  },
})

const listsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists',
  component: ListsPage,
})

const createListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/new',
  component: CreateListPage,
})

const editListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/edit',
  component: () => {
    const { listId } = editListRoute.useParams()
    return EditListPage({ listId })
  },
})

const shoppingListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId',
  component: () => {
    const { listId } = shoppingListRoute.useParams()
    return ShoppingListPage({ listId })
  },
})

const categoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/category/$categoryId',
  component: () => {
    const { listId, categoryId } = categoryRoute.useParams()
    return CategoryPage({ listId, categoryId })
  },
})

const listMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/members',
  loader: async () => {
    if (!canReachServer()) return
    // Owner names and the member cap come from the list projection; the
    // friends fill the one-tap picker. Failing either costs data, not the
    // screen — the cached state stands in.
    try {
      const projection = await fetchSharingProjection('list')
      store.dispatch(ownerNamesLoaded({ ownerNames: projection.ownerNames }))
      if (projection.maxMembers !== null) {
        store.dispatch(
          memberLimitLoaded({ maxMembers: projection.maxMembers }),
        )
      }
    } catch (error: unknown) {
      console.warn('reading the list projection failed', error)
    }
    try {
      store.dispatch(friendsLoaded({ friends: await fetchFriends() }))
    } catch (error: unknown) {
      console.warn('reading friends failed', error)
    }
  },
  component: () => {
    const { listId } = listMembersRoute.useParams()
    return ListMembersPage({ listId })
  },
})

const listInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/invite',
  loader: async ({ params }) => {
    const state = store.getState()
    if (!canReachServer()) return { invite: null }
    const list = selectListById(state, params.listId)

    // Only the owner may mint invites (events.md owner model). Before the
    // first share the owner is still the local sentinel — the name sheet
    // creates the identity and reloads this loader.
    if (!list || list.ownerId !== selectCurrentUserId(state)) {
      return { invite: null }
    }
    try {
      return { invite: await fetchInvite({ kind: 'list', id: params.listId }) }
    } catch (error: unknown) {
      console.warn('reading the list invite failed', error)
      return { invite: null }
    }
  },
  component: () => {
    const { listId } = listInviteRoute.useParams()
    const { invite } = listInviteRoute.useLoaderData()
    return ListInvitePage({ listId, invite })
  },
})

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  loader: async ({ params }) => {
    // Redeeming needs an identity: the server writes the member-added
    // event under the caller's JWT. A device without one gets the name
    // sheet on the page below, which joins as soon as the account exists.
    if (!selectHasIdentity(store.getState())) return { outcome: null }

    const outcome = await joinWithToken(params.token)
    if (outcome.status === 'joined') {
      throw redirect({
        to: '/lists/$listId',
        params: { listId: outcome.aggregate.id },
      })
    }
    return { outcome }
  },
  component: () => {
    const { token } = joinRoute.useParams()
    const { outcome } = joinRoute.useLoaderData()
    return JoinListPage({ token, outcome })
  },
})

const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  loader: async () => {
    if (!canReachServer()) return
    // Refresh the address book; on failure the cached state stands.
    try {
      store.dispatch(friendsLoaded({ friends: await fetchFriends() }))
    } catch (error: unknown) {
      console.warn('reading friends failed', error)
    }
  },
  component: FriendsPage,
})

const friendsInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends/invite',
  loader: async () => {
    if (!canReachServer()) return { invite: null }
    try {
      return { invite: await createFriendInvite() }
    } catch (error: unknown) {
      console.warn('minting the friend invite failed', error)
      return { invite: null }
    }
  },
  component: () => {
    const { invite } = friendsInviteRoute.useLoaderData()
    return FriendInvitePage({ invite })
  },
})

const acceptFriendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friend/$token',
  component: () => {
    const { token } = acceptFriendRoute.useParams()
    return AcceptFriendPage({ token })
  },
})

const recipesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes',
  component: RecipesPage,
})

const createRecipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/new',
  component: CreateRecipePage,
})

const editRecipeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$recipeId/edit',
  component: () => {
    const { recipeId } = editRecipeRoute.useParams()
    return EditRecipePage({ recipeId })
  },
})

const recipeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$recipeId',
  component: () => {
    const { recipeId } = recipeDetailRoute.useParams()
    return RecipeDetailPage({ recipeId })
  },
})

const recipeMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$recipeId/members',
  loader: async () => {
    if (!canReachServer()) return
    // Same two reads as for a list: the projection carries owner names and
    // the member cap, the friends fill the one-tap picker. Failing either
    // costs data, not the screen.
    try {
      const projection = await fetchSharingProjection('recipe')
      store.dispatch(
        recipeOwnerNamesLoaded({ ownerNames: projection.ownerNames }),
      )
      if (projection.maxMembers !== null) {
        store.dispatch(memberLimitLoaded({ maxMembers: projection.maxMembers }))
      }
    } catch (error: unknown) {
      console.warn('reading the recipe projection failed', error)
    }
    try {
      store.dispatch(friendsLoaded({ friends: await fetchFriends() }))
    } catch (error: unknown) {
      console.warn('reading friends failed', error)
    }
  },
  component: () => {
    const { recipeId } = recipeMembersRoute.useParams()
    return RecipeMembersPage({ recipeId })
  },
})

const recipeInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$recipeId/invite',
  loader: async ({ params }) => {
    const state = store.getState()
    if (!canReachServer()) return { invite: null }
    const recipe = selectRecipeById(state, params.recipeId)

    // Only the owner may mint invites (events.md owner model). Before the
    // first share the owner is still the local sentinel — the name sheet
    // creates the identity and reloads this loader.
    if (!recipe || recipe.ownerId !== selectCurrentUserId(state)) {
      return { invite: null }
    }
    try {
      return {
        invite: await fetchInvite({ kind: 'recipe', id: params.recipeId }),
      }
    } catch (error: unknown) {
      console.warn('reading the recipe invite failed', error)
      return { invite: null }
    }
  },
  component: () => {
    const { recipeId } = recipeInviteRoute.useParams()
    const { invite } = recipeInviteRoute.useLoaderData()
    return RecipeInvitePage({ recipeId, invite })
  },
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfilePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  listsRoute,
  createListRoute,
  editListRoute,
  shoppingListRoute,
  categoryRoute,
  listMembersRoute,
  listInviteRoute,
  joinRoute,
  friendsRoute,
  friendsInviteRoute,
  acceptFriendRoute,
  recipesRoute,
  createRecipeRoute,
  editRecipeRoute,
  recipeDetailRoute,
  recipeMembersRoute,
  recipeInviteRoute,
  profileRoute,
])

// While the root beforeLoad hydrates the store on startup, the lists
// skeleton renders instead of a blank screen (pendingMs 0 shows it
// immediately, pendingMinMs keeps it from flashing on fast loads).
export const router = createRouter({
  routeTree,
  defaultPendingComponent: ListsPageSkeleton,
  defaultPendingMs: 0,
  defaultPendingMinMs: 200,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
