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
import { listsFromStorage } from '../features/lists/domain/listsFromStorage'
import {
  friendIntentRestored,
  joinIntentRestored,
} from '../features/lists/join/joinIntentSlice'
import {
  FRIEND_INTENT_KEY,
  JOIN_INTENT_KEY,
} from '../features/lists/join/joinIntentClientStorageHandler'
import {
  friendsLoaded,
  friendsRestored,
} from '../features/friends/domain/friendsSlice'
import { FRIENDS_STORAGE_KEY } from '../features/friends/domain/friendsClientStorageHandler'
import {
  createFriendInvite,
  fetchFriends,
} from '../features/friends/friendCommands'
import { FriendsPage } from '../features/friends/FriendsPage'
import { FriendInvitePage } from '../features/friends/FriendInvitePage'
import { AcceptFriendPage } from '../features/friends/AcceptFriendPage'
import { fetchSharingProjection } from '../features/sharing/memberCommands'
import { inviteStateOf } from '../features/sharing/inviteStateOf'
import { joinWithToken } from '../features/sharing/joinWithToken'
import { ensureIdentity } from '../features/auth/domain/identityThunks'
import type { AggregateKind } from './sync/aggregate'
import { ListMembersPage } from '../features/lists/members/ListMembersPage'
import { ListInvitePage } from '../features/lists/members/ListInvitePage'
import type { InviteState } from '../features/sharing/InvitePage'
import { RecipeMembersPage } from '../features/recipes/members/RecipeMembersPage'
import { RecipeInvitePage } from '../features/recipes/members/RecipeInvitePage'
import { JoinListPage } from '../features/lists/join/JoinListPage'
import { JoiningScreen } from '../features/lists/join/JoiningScreen'
import { InvitePageSkeleton } from '../features/sharing/InvitePageSkeleton'
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
  deviceIdentified,
  guestIdentityCreated,
  linkedIdentityRestored,
  selectCurrentUserId,
  selectHasAccount,
  type EstablishedIdentity,
} from '../features/auth/domain/authSlice'
import { restoredIdentity } from '../features/auth/domain/restoredIdentity'
import { ensureDeviceName } from '../features/auth/domain/deviceName'
import {
  ensureShadowCredentials,
  restoreShadowSession,
} from '../features/auth/domain/shadowAccount'
import { appLoaded, selectIsAppLoaded } from './appSlice'
import { openLocalLog, pushQueuedEvents, startSync } from './sync/startSync'
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
    return restoredIdentity(cognitoUser.username, {
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
 * refresh token expired. A device that never shared makes no network call.
 */
async function identityOfStoredCredentials(): Promise<EstablishedIdentity | null> {
  try {
    if (!(await restoreShadowSession())) return null
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
 * no account — that is a normal state here, not a failure.
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
 * account has no session, so every read would come back 401. The screens
 * behind these loaders show the name sheet instead.
 */
function canReachServer(): boolean {
  return selectHasAccount(store.getState())
}

/**
 * Everything the invite screens need before they may ask for a token, in the
 * order they need it: sharing is what makes an account necessary, so it is
 * made here, silently, while the pending skeleton covers the wait (nobody is
 * asked anything — the device has carried its name since the first start).
 * Then what this device wrote goes out, because the invite is about to name
 * a list the server has to know already.
 *
 * False when that failed — offline at the very first share, where Cognito
 * cannot be reached. The screen says "unreachable" and offers another try,
 * which beats dropping the user into the router's error boundary.
 */
async function preparedToShare(): Promise<boolean> {
  try {
    await store.dispatch(ensureIdentity())
    await pushQueuedEvents()
    return true
  } catch (error: unknown) {
    console.warn('preparing this device to share failed', error)
    return false
  }
}

// --- Background refreshes ---
//
// A screen never waits for the network (react-best-practices.md): it
// renders from the store and these fill in what the store could not know.
// Deliberately NOT awaited — awaiting in a loader claims "this screen
// cannot exist without the answer", which is true for a mintable invite
// token and for joining, and for nothing else here.

/**
 * Owner display names and the member cap of one kind. Neither can travel
 * in an event: the owner never triggers a member-added event for
 * themselves, and the cap is a server-wide number.
 */
function refreshSharingProjection(kind: AggregateKind): void {
  if (!canReachServer()) return
  void fetchSharingProjection(kind)
    .then((projection) => {
      store.dispatch(
        kind === 'recipe'
          ? recipeOwnerNamesLoaded({ ownerNames: projection.ownerNames })
          : ownerNamesLoaded({ ownerNames: projection.ownerNames }),
      )
      if (projection.maxMembers !== null) {
        store.dispatch(memberLimitLoaded({ maxMembers: projection.maxMembers }))
      }
    })
    .catch((error: unknown) => {
      console.warn(`reading the ${kind} projection failed`, error)
    })
}

/** The address book behind the one-tap picker. Cached locally since boot. */
function refreshFriends(): void {
  if (!canReachServer()) return
  void fetchFriends()
    .then((friends) => store.dispatch(friendsLoaded({ friends })))
    .catch((error: unknown) => {
      console.warn('reading friends failed', error)
    })
}

const rootRoute = createRootRoute({
  component: RootLayout,
  beforeLoad: async () => {
    // The bootstrap below runs once per app start. beforeLoad fires on
    // every navigation, so later runs bail out immediately — this also
    // keeps the pending skeleton from flashing on in-app navigations.
    if (selectIsAppLoaded(store.getState())) return

    // 1. Who this device is — id and name, minted on the very first start,
    //    kept ever after. The shadow credentials' username is the id. Before
    //    the identity, so an account Cognito already knows still wins.
    const { username } = await ensureShadowCredentials()
    store.dispatch(
      deviceIdentified({
        userId: username,
        name: await ensureDeviceName(),
      }),
    )

    // 2. Restore the identity. A live Amplify session wins; stored shadow
    //    credentials without one mean the token cache was cleared — sign in
    //    again silently. Neither: the device stays local, which is a normal
    //    state here, not an error.
    await restoreIdentity()

    // 3. Load persisted lists + preferences (local-first: rendered
    // immediately, the sync engine catches up with the server log in
    // the background once startSync() runs below).
    const rawLists = await getItem(LISTS_KEY)
    const rawPreferences = await getItem(PREFS_KEY)

    let lists: readonly ShoppingList[] = []
    let preferences: { readonly [listId: string]: ListPreferences } = {}

    if (rawLists) {
      try {
        lists = listsFromStorage(JSON.parse(rawLists))
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

    // 4. Load or create device ID
    let deviceId = await getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      await setItem(DEVICE_ID_KEY, deviceId)
    }

    // 5. Hydrate lists + shopping items from clientStorage
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

    // 6. Open the local event log: the queued events of this device go
    // back into the reducer's pending queue, with or without an account.
    await openLocalLog()

    // 7. Local-first boot: the store above is hydrated from clientStorage
    // and rendered immediately. With an identity the sync engine now
    // catches up with the server log in the background — no await, so
    // the app never blocks the first render on network. Without one this
    // is a no-op: the log stays on the device.
    void startSync()
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
  loader: () => refreshSharingProjection('list'),
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
  // The members, their names and roles are all in the store — this screen
  // is instant, and the two refreshes land underneath it.
  loader: () => {
    refreshSharingProjection('list')
    refreshFriends()
  },
  component: () => {
    const { listId } = listMembersRoute.useParams()
    return ListMembersPage({ listId })
  },
})

const listInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/invite',
  pendingComponent: InvitePageSkeleton,
  loader: async ({ params }) => {
    if (!(await preparedToShare())) {
      const unreachable: InviteState = { status: 'unreachable' }
      return { state: unreachable }
    }

    const state = store.getState()
    const list = selectListById(state, params.listId)

    // Only the owner may mint invites (events.md owner model).
    if (!list || list.ownerId !== selectCurrentUserId(state)) {
      const refused: InviteState = { status: 'notOwner' }
      return { state: refused }
    }
    return { state: await inviteStateOf({ kind: 'list', id: params.listId }) }
  },
  component: () => {
    const { listId } = listInviteRoute.useParams()
    const { state } = listInviteRoute.useLoaderData()
    return ListInvitePage({ listId, state })
  },
})

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  pendingComponent: JoiningScreen,
  loader: async ({ params }) => {
    // Redeeming needs an identity: the server writes the member-added event
    // under the caller's JWT. It is created here rather than asked for —
    // the invitee arrives with a name already.
    await store.dispatch(ensureIdentity())

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
    const { outcome } = joinRoute.useLoaderData()
    return JoinListPage({ outcome })
  },
})

const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  // The address book was hydrated from storage at boot; this only refreshes it.
  loader: () => refreshFriends(),
  component: FriendsPage,
})

const friendsInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends/invite',
  pendingComponent: InvitePageSkeleton,
  loader: async () => {
    try {
      // Inside the try: offline at the first share, making the account is
      // the step that fails, and the screen's own "no link" state says that
      // better than the router's error boundary. A friendship link names no
      // aggregate, so nothing has to be pushed first.
      await store.dispatch(ensureIdentity())
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
  // Same two refreshes as for a list, and just as little waiting.
  loader: () => {
    refreshSharingProjection('recipe')
    refreshFriends()
  },
  component: () => {
    const { recipeId } = recipeMembersRoute.useParams()
    return RecipeMembersPage({ recipeId })
  },
})

const recipeInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recipes/$recipeId/invite',
  pendingComponent: InvitePageSkeleton,
  loader: async ({ params }) => {
    // Same as for a list: the account is made here, not asked for.
    if (!(await preparedToShare())) {
      const unreachable: InviteState = { status: 'unreachable' }
      return { state: unreachable }
    }

    const state = store.getState()
    const recipe = selectRecipeById(state, params.recipeId)

    // Only the owner may mint invites (events.md owner model).
    if (!recipe || recipe.ownerId !== selectCurrentUserId(state)) {
      const refused: InviteState = { status: 'notOwner' }
      return { state: refused }
    }
    return {
      state: await inviteStateOf({ kind: 'recipe', id: params.recipeId }),
    }
  },
  component: () => {
    const { recipeId } = recipeInviteRoute.useParams()
    const { state } = recipeInviteRoute.useLoaderData()
    return RecipeInvitePage({ recipeId, state })
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

// The lists skeleton belongs to the app start: while the root beforeLoad
// hydrates the store, it renders instead of a blank screen (pendingMs 0
// shows it immediately, pendingMinMs keeps it from flashing).
//
// Navigation inside the app never reaches a pending state — those loaders
// only kick off background refreshes and return at once. The three screens
// that do have to wait for the server bring their own pendingComponent.
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
