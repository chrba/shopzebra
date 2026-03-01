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
import { listsLoaded, listPreferencesLoaded } from '../features/lists/model/listsSlice'
import {
  sessionRestored,
  sessionNotFound,
  selectIsAuthenticated,
  type AuthProvider,
} from '../features/auth/state/authSlice'
import { appLoaded } from './appSlice'
import { getItem, setItem } from './clientStorage'
import type { ShoppingList, ListPreferences } from '../features/lists/model/listsSlice'
import { RootLayout } from './RootLayout'
import { ListsPage } from '../features/lists/ListsPage'
import { CreateListPage } from '../features/manage-list/CreateListPage'
import { EditListPage } from '../features/manage-list/EditListPage'
import { SignInPage } from '../features/auth/SignInPage'
import { SignUpPage } from '../features/auth/SignUpPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { ProfilePage } from '../features/profile/ProfilePage'

const LISTS_KEY = 'shopzebra_lists'
const PREFS_KEY = 'shopzebra_list_preferences'

const LETTER_TO_MEMBER_ID: Readonly<Record<string, string>> = {
  M: 'mama',
  P: 'papa',
  L: 'lena',
  O: 'opa',
}

const DEFAULT_LISTS: readonly ShoppingList[] = [
  { id: 'rewe', name: 'REWE Wocheneinkauf', memberIds: ['mama', 'papa', 'lena'] },
  { id: 'dm', name: 'dm Drogerie', memberIds: ['papa'] },
  { id: 'party', name: 'Geburtstagsparty Lena', memberIds: ['mama', 'papa', 'lena', 'opa'] },
  { id: 'aldi', name: 'ALDI Vorräte', memberIds: ['mama'] },
  { id: 'baumarkt', name: 'Baumarkt Garten', memberIds: ['papa', 'opa'] },
  { id: 'wochenmarkt', name: 'Wochenmarkt Samstag', memberIds: ['mama', 'lena'] },
]

const DEFAULT_LIST_PREFERENCES: { readonly [listId: string]: ListPreferences } = {
  rewe: { color: 'green', emoji: '\u{1F6D2}' },
  dm: { color: 'blue', emoji: '\u{1F9F4}' },
  party: { color: 'red', emoji: '\u{1F389}' },
  aldi: { color: 'green', emoji: '\u{1F34E}' },
  baumarkt: { color: 'blue', emoji: '\u{1F527}' },
  wochenmarkt: { color: 'red', emoji: '\u{1F9C0}' },
}

type OldFormatList = {
  readonly id: string
  readonly name: string
  readonly emoji: string
  readonly color: string
  readonly members: readonly { readonly letter: string; readonly color: string }[]
  readonly [key: string]: unknown
}

function migrateOldFormat(oldLists: readonly OldFormatList[]): {
  readonly lists: readonly ShoppingList[]
  readonly preferences: { readonly [listId: string]: ListPreferences }
} {
  const lists: readonly ShoppingList[] = oldLists.map((old) => ({
    id: old.id,
    name: old.name,
    memberIds: old.members.map((m) => LETTER_TO_MEMBER_ID[m.letter] ?? m.letter.toLowerCase()),
  }))
  const preferences: { readonly [listId: string]: ListPreferences } = Object.fromEntries(
    oldLists.map((old) => [
      old.id,
      { color: old.color as ListPreferences['color'], emoji: old.emoji },
    ]),
  )
  return { lists, preferences }
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
          // Detect old format: first item has 'emoji' property
          if ('emoji' in (parsed[0] as Record<string, unknown>)) {
            const migrated = migrateOldFormat(parsed as readonly OldFormatList[])
            lists = migrated.lists
            preferences = migrated.preferences
            // Persist migrated data
            void setItem(LISTS_KEY, JSON.stringify(lists))
            void setItem(PREFS_KEY, JSON.stringify(preferences))
          } else {
            lists = parsed as readonly ShoppingList[]
          }
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

    store.dispatch(listsLoaded({ lists: allLists }))
    store.dispatch(listPreferencesLoaded(allPreferences))
    store.dispatch(appLoaded({ theme: 'dark' }))
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
