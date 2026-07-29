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
  redirect,
} from '@tanstack/react-router'
import { getCurrentUser, fetchAuthSession } from 'aws-amplify/auth'
import { store } from './store'
import { listsLoaded } from '../features/lists/domain/listsSlice'
import { shoppingLoaded } from '../features/shopping/domain/shoppingSlice'
import { SHOPPING_STORAGE_KEY } from '../features/shopping/domain/shoppingClientStorageHandler'
import { listPreferencesLoaded } from '../features/preferences/domain/preferencesSlice'
import {
  sessionRestored,
  sessionNotFound,
  selectIsAuthenticated,
  type AuthProvider,
} from '../features/auth/domain/authSlice'
import { appLoaded, selectIsAppLoaded } from './appSlice'
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

function requireAuth() {
  const state = store.getState()
  if (!selectIsAuthenticated(state)) {
    throw redirect({ to: '/signin' })
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
