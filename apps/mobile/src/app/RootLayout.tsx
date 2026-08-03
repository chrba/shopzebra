// Shell around every page — renders the bottom navigation
// bar on most screens but hides it on fullscreen routes
// like list creation, sharing and joining.

import { Outlet, useRouterState } from '@tanstack/react-router'
import { BottomNav, type NavTab } from '../ui/BottomNav'

const FULLSCREEN_ROUTES = ['/lists/new', '/recipes/new']

/** Screens that own the whole viewport — no bottom nav underneath. */
function isFullscreen(pathname: string): boolean {
  return (
    FULLSCREEN_ROUTES.includes(pathname) ||
    pathname.endsWith('/members') ||
    pathname.endsWith('/invite') ||
    pathname.endsWith('/edit') ||
    pathname === '/friends' ||
    pathname.startsWith('/friend/') ||
    pathname.startsWith('/join/')
  )
}

/** Which tab the current route belongs to. */
function tabOf(pathname: string): NavTab {
  return pathname.startsWith('/recipes') ? 'rezepte' : 'listen'
}

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const showNav = !isFullscreen(pathname)

  return (
    <>
      <Outlet />
      {showNav && <BottomNav activeTab={tabOf(pathname)} />}
    </>
  )
}
