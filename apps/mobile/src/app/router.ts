import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { store } from './store'
import { listsLoaded } from '../features/lists/listsSlice'
import { appLoaded } from './appSlice'
import { getItem } from './storage'
import type { ShoppingList } from '../features/lists/listsSlice'
import { RootLayout } from './RootLayout'
import { ListsPage } from '../features/lists/ListsPage'
import { CreateListPage } from '../features/manage-list/CreateListPage'
import { EditListPage } from '../features/manage-list/EditListPage'

const LISTS_KEY = 'shopzebra_lists'

const DEFAULT_LISTS: readonly ShoppingList[] = [
  {
    id: 'rewe',
    name: 'REWE Wocheneinkauf',
    emoji: '\u{1F6D2}',
    color: 'green',
    itemCount: 15,
    members: [
      { letter: 'M', color: '#6BBF6B' },
      { letter: 'P', color: '#5BA8D5' },
      { letter: 'L', color: '#E07B7B' },
    ],
    activity: { who: 'Mama', what: '+Milch', when: '14:02' },
    badge: '3 neu',
  },
  {
    id: 'dm',
    name: 'dm Drogerie',
    emoji: '\u{1F9F4}',
    color: 'blue',
    itemCount: 4,
    members: [{ letter: 'P', color: '#5BA8D5' }],
    activity: { who: 'Papa', what: 'erstellt', when: 'gestern' },
    badge: null,
  },
  {
    id: 'party',
    name: 'Geburtstagsparty Lena',
    emoji: '\u{1F389}',
    color: 'red',
    itemCount: 22,
    members: [
      { letter: 'M', color: '#6BBF6B' },
      { letter: 'P', color: '#5BA8D5' },
      { letter: 'L', color: '#E07B7B' },
      { letter: 'O', color: '#A07BCC' },
    ],
    activity: { who: 'Lena', what: '+Schokopudding', when: 'Mo' },
    badge: null,
  },
  {
    id: 'aldi',
    name: 'ALDI Vorräte',
    emoji: '\u{1F34E}',
    color: 'green',
    itemCount: 8,
    members: [{ letter: 'M', color: '#6BBF6B' }],
    activity: { who: 'Mama', what: 'erstellt', when: 'Di' },
    badge: null,
  },
  {
    id: 'baumarkt',
    name: 'Baumarkt Garten',
    emoji: '\u{1F527}',
    color: 'blue',
    itemCount: 6,
    members: [
      { letter: 'P', color: '#5BA8D5' },
      { letter: 'O', color: '#A07BCC' },
    ],
    activity: { who: 'Papa', what: '+Erde', when: 'So' },
    badge: '2 neu',
  },
  {
    id: 'wochenmarkt',
    name: 'Wochenmarkt Samstag',
    emoji: '\u{1F9C0}',
    color: 'red',
    itemCount: 11,
    members: [
      { letter: 'M', color: '#6BBF6B' },
      { letter: 'L', color: '#E07B7B' },
    ],
    activity: { who: 'Mama', what: '+Käse', when: 'letzte Wo' },
    badge: null,
  },
]

const rootRoute = createRootRoute({
  component: RootLayout,
  beforeLoad: async () => {
    const raw = await getItem(LISTS_KEY)
    let lists: readonly ShoppingList[] = []
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          lists = parsed as readonly ShoppingList[]
        }
      } catch {
        // ignore malformed data
      }
    }

    const allLists = lists.length > 0 ? lists : DEFAULT_LISTS
    store.dispatch(listsLoaded({ lists: allLists }))
    store.dispatch(appLoaded({ theme: 'dark' }))
  },
})

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

const routeTree = rootRoute.addChildren([
  indexRoute,
  listsRoute,
  createListRoute,
  editListRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
