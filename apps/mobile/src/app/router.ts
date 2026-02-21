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
import { loadTheme } from './theme'
import type { ShoppingList } from '../features/lists/listsSlice'
import { RootLayout } from './RootLayout'
import { ListsPage } from '../features/lists/ListsPage'
import { CreateListPage } from '../features/lists/CreateListPage'
import { ShoppingListPage } from '../features/lists/ShoppingListPage'

const LISTS_KEY = 'shopzebra_lists'

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

    const theme = await loadTheme()
    store.dispatch(listsLoaded({ lists }))
    store.dispatch(appLoaded({ theme }))
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

const listDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lists/$listId',
  component: function ListDetailPage() {
    const { listId } = listDetailRoute.useParams()
    return ShoppingListPage({ listId })
  },
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  listsRoute,
  createListRoute,
  listDetailRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
