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
import { listPreferencesLoaded } from '../features/preferences/domain/preferencesSlice'
import {
  sessionRestored,
  sessionNotFound,
  selectIsAuthenticated,
  type AuthProvider,
} from '../features/auth/domain/authSlice'
import { appLoaded } from './appSlice'
import { getItem, setItem } from './clientStorage'
import type { ShoppingList } from '../features/lists/domain/listsDomain'
import type { ListPreferences } from '../features/preferences/domain/preferencesDomain'
import { RootLayout } from './RootLayout'
import { ListsPage } from '../features/lists/overview/ListsPage'
import { CreateListPage } from '../features/lists/manage/CreateListPage'
import { EditListPage } from '../features/lists/manage/EditListPage'
import { SignInPage } from '../features/auth/sign-in/SignInPage'
import { SignUpPage } from '../features/auth/sign-up/SignUpPage'
import { ForgotPasswordPage } from '../features/auth/forgot-password/ForgotPasswordPage'
import { ProfilePage } from '../features/auth/profile/ProfilePage'

const DEVICE_ID_KEY = 'shopzebra_device_id'
const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

const DEFAULT_LISTS: readonly ShoppingList[] = [
  { id: 'rewe', name: 'REWE Wocheneinkauf', ownerId: 'mama', memberIds: ['mama', 'papa', 'lena'] },
  { id: 'dm', name: 'dm Drogerie', ownerId: 'papa', memberIds: ['papa'] },
  { id: 'party', name: 'Geburtstagsparty Lena', ownerId: 'mama', memberIds: ['mama', 'papa', 'lena', 'opa'] },
  { id: 'aldi', name: 'ALDI Vorräte', ownerId: 'mama', memberIds: ['mama'] },
  { id: 'baumarkt', name: 'Baumarkt Garten', ownerId: 'papa', memberIds: ['papa', 'opa'] },
  { id: 'wochenmarkt', name: 'Wochenmarkt Samstag', ownerId: 'mama', memberIds: ['mama', 'lena'] },
]

const DEFAULT_LIST_PREFERENCES: { readonly [listId: string]: ListPreferences } = {
  rewe: { color: 'green', emoji: '\u{1F6D2}' },
  dm: { color: 'blue', emoji: '\u{1F9F4}' },
  party: { color: 'red', emoji: '\u{1F389}' },
  aldi: { color: 'green', emoji: '\u{1F34E}' },
  baumarkt: { color: 'blue', emoji: '\u{1F527}' },
  wochenmarkt: { color: 'red', emoji: '\u{1F9C0}' },
}


const rootRoute = createRootRoute({
  component: RootLayout,
  beforeLoad: async () => {
    // 1. Check Amplify session
    try {
      const cognitoUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const claims = session.tokens?.idToken?.payload
      const identities = (claims?.identities as readonly { readonly providerName?: string }[] | undefined)
      const providerName = identities?.[0]?.providerName?.toLowerCase()
      const provider: AuthProvider = providerName === 'google' ? 'google' : providerName === 'apple' ? 'apple' : 'email'
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

    // 2. Load persisted lists + preferences
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
              ? [{
                  id: entry.id,
                  name: entry.name,
                  ownerId: entry.ownerId ?? entry.memberIds?.[0] ?? 'unknown',
                  memberIds: entry.memberIds ?? [],
                }]
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

    const allLists = lists.length > 0 ? lists : DEFAULT_LISTS
    const allPreferences = Object.keys(preferences).length > 0 ? preferences : DEFAULT_LIST_PREFERENCES

    // 3. Load or create device ID
    let deviceId = await getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      await setItem(DEVICE_ID_KEY, deviceId)
    }

    store.dispatch(listsLoaded({ lists: allLists }))
    store.dispatch(listPreferencesLoaded(allPreferences))
    store.dispatch(appLoaded({ theme: 'dark', deviceId }))
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
  profileRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
