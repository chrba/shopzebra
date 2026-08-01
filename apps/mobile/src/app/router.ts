// Route tree and app bootstrap.
//
// The root route's beforeLoad runs once on startup: it
// restores the Cognito session, loads persisted lists from
// clientStorage and hydrates the Redux store — all before
// any component renders.
//
// Auth guards (requireAuth / requireGuest) protect routes
// so unauthenticated users land on /signin and logged-in
// users skip the auth pages.

import {
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
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
  friendIntentStored,
  joinIntentCleared,
  joinIntentRestored,
  joinIntentStored,
  selectPendingFriendToken,
  selectPendingJoinToken,
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
  fetchListInvite,
  fetchListProjection,
  joinListByToken,
} from '../features/lists/members/memberCommands'
import { MembersPage } from '../features/lists/members/MembersPage'
import { InvitePage } from '../features/lists/members/InvitePage'
import { JoinListPage } from '../features/lists/join/JoinListPage'
import { syncEngine } from './sync/syncEngine'
import { shoppingLoaded } from '../features/shopping/domain/shoppingSlice'
import { SHOPPING_STORAGE_KEY } from '../features/shopping/domain/shoppingClientStorageHandler'
import { listPreferencesLoaded } from '../features/preferences/domain/preferencesSlice'
import {
  sessionRestored,
  sessionNotFound,
  selectAuthUser,
  selectIsAuthenticated,
  type AuthProvider,
} from '../features/auth/domain/authSlice'
import { appLoaded, selectDeviceId, selectIsAppLoaded } from './appSlice'
import { startSync } from './sync/startSync'
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
import { SignInPage } from '../features/auth/sign-in/SignInPage'
import { SignUpPage } from '../features/auth/sign-up/SignUpPage'
import { ForgotPasswordPage } from '../features/auth/forgot-password/ForgotPasswordPage'
import { ProfilePage } from '../features/auth/profile/ProfilePage'

const DEVICE_ID_KEY = 'shopzebra_device_id'
const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

const rootRoute = createRootRoute({
  component: RootLayout,
  beforeLoad: async () => {
    // The bootstrap below runs once per app start. beforeLoad fires on
    // every navigation, so later runs bail out immediately — this also
    // keeps the pending skeleton from flashing on in-app navigations.
    if (selectIsAppLoaded(store.getState())) return

    // 1. Check Amplify session
    try {
      const cognitoUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const claims = session.tokens?.idToken?.payload
      const identities = claims?.identities as
        | readonly { readonly providerName?: string }[]
        | undefined
      const providerName = identities?.[0]?.providerName?.toLowerCase()
      const provider: AuthProvider =
        providerName === 'google'
          ? 'google'
          : providerName === 'apple'
            ? 'apple'
            : 'email'
      store.dispatch(
        sessionRestored({
          user: {
            userId: cognitoUser.userId,
            email: (claims?.email as string) ?? '',
            name: (claims?.name as string) ?? '',
            provider,
          },
        }),
      )
    } catch {
      // No active session
      store.dispatch(sessionNotFound())
    }

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

    // 5. Local-first boot: the store above is hydrated from clientStorage
    // and rendered immediately. If authenticated, the sync engine now
    // catches up with the server log in the background — no await, so
    // the app never blocks the first render on network.
    if (selectIsAuthenticated(store.getState())) startSync()
  },
})

// --- Auth routes (public, redirect if already authenticated) ---

function requireGuest() {
  const state = store.getState()
  if (selectIsAuthenticated(state)) {
    throw redirect({ to: '/profile' })
  }
}

/** Token of an invite route, or null for every other path. */
function joinTokenOf(pathname: string): string | null {
  const token = pathname.startsWith('/join/')
    ? pathname.slice('/join/'.length)
    : ''
  return token === '' ? null : token
}

/** Token of a friendship invite route, or null for every other path. */
function friendTokenOf(pathname: string): string | null {
  const token = pathname.startsWith('/friend/')
    ? pathname.slice('/friend/'.length)
    : ''
  return token === '' ? null : token
}

/**
 * Guards every protected route, and doubles as the single place where a
 * deferred join is resolved: whichever route the user lands on after
 * signing in, a pending invite wins. Works on a cold start too, because
 * the intent is persisted.
 */
function requireAuth({
  location,
}: {
  readonly location: { readonly pathname: string }
}) {
  const state = store.getState()

  if (!selectIsAuthenticated(state)) {
    // Remember the invite before sending the visitor off to sign in —
    // otherwise the token dies on the auth detour.
    const token = joinTokenOf(location.pathname)
    if (token) store.dispatch(joinIntentStored({ token }))
    const friendToken = friendTokenOf(location.pathname)
    if (friendToken) store.dispatch(friendIntentStored({ token: friendToken }))
    throw redirect({ to: '/signin' })
  }

  const onInviteRoute =
    joinTokenOf(location.pathname) !== null ||
    friendTokenOf(location.pathname) !== null
  // Not on an invite route itself, or the redirect would loop. A pending
  // list join outranks a pending friendship — it carries more intent.
  if (!onInviteRoute) {
    const pendingToken = selectPendingJoinToken(state)
    if (pendingToken) {
      throw redirect({ to: '/join/$token', params: { token: pendingToken } })
    }
    const pendingFriendToken = selectPendingFriendToken(state)
    if (pendingFriendToken) {
      throw redirect({
        to: '/friend/$token',
        params: { token: pendingFriendToken },
      })
    }
  }
}

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signin',
  beforeLoad: requireGuest,
  component: SignInPage,
})

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  beforeLoad: requireGuest,
  component: SignUpPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  beforeLoad: requireGuest,
  component: ForgotPasswordPage,
})

// --- App routes (protected, redirect if not authenticated) ---

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
  beforeLoad: requireAuth,
  component: ListsPage,
})

const createListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/new',
  beforeLoad: requireAuth,
  component: CreateListPage,
})

const editListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/edit',
  beforeLoad: requireAuth,
  component: () => {
    const { listId } = editListRoute.useParams()
    return EditListPage({ listId })
  },
})

const shoppingListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId',
  beforeLoad: requireAuth,
  component: () => {
    const { listId } = shoppingListRoute.useParams()
    return ShoppingListPage({ listId })
  },
})

const categoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/category/$categoryId',
  beforeLoad: requireAuth,
  component: () => {
    const { listId, categoryId } = categoryRoute.useParams()
    return CategoryPage({ listId, categoryId })
  },
})

const listMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/members',
  beforeLoad: requireAuth,
  loader: async () => {
    // Owner names and the member cap come from the list projection; the
    // friends fill the one-tap picker. Failing either costs data, not the
    // screen — the cached state stands in.
    try {
      const projection = await fetchListProjection()
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
    return MembersPage({ listId })
  },
})

const listInviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId/invite',
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    const state = store.getState()
    const list = selectListById(state, params.listId)
    const me = selectAuthUser(state)

    // Only the owner may mint invites (events.md owner model).
    if (!list || !me || list.ownerId !== me.userId) return { invite: null }
    try {
      return { invite: await fetchListInvite(params.listId) }
    } catch (error: unknown) {
      console.warn('reading the list invite failed', error)
      return { invite: null }
    }
  },
  component: () => {
    const { listId } = listInviteRoute.useParams()
    const { invite } = listInviteRoute.useLoaderData()
    return InvitePage({ listId, invite })
  },
})

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/join/$token',
  beforeLoad: requireAuth,
  loader: async ({ params }) => {
    try {
      const { listId } = await joinListByToken(params.token, {
        eventId: crypto.randomUUID(),
        deviceId: selectDeviceId(store.getState()),
      })
      // Cleared on success and on failure alike — a token left behind
      // would fire again on every later sign-in.
      store.dispatch(joinIntentCleared())
      // Pull the new list and its log before navigating into it.
      await syncEngine.requestSync()
      throw redirect({ to: '/lists/$listId', params: { listId } })
    } catch (error: unknown) {
      // The success path throws a redirect — never swallow it.
      if (isRedirect(error)) throw error
      store.dispatch(joinIntentCleared())
      // 409 is the server's "this list is full" — worth its own message.
      const message = error instanceof Error ? error.message : ''
      return { reason: message.includes('409') ? 'full' : 'invalid' } as const
    }
  },
  component: () => {
    const data = joinRoute.useLoaderData()
    return JoinListPage({ reason: data?.reason ?? 'invalid' })
  },
})

const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  beforeLoad: requireAuth,
  loader: async () => {
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
  beforeLoad: requireAuth,
  loader: async () => {
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
  beforeLoad: requireAuth,
  component: () => {
    const { token } = acceptFriendRoute.useParams()
    return AcceptFriendPage({ token })
  },
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  beforeLoad: requireAuth,
  component: ProfilePage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  forgotPasswordRoute,
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
