// Shell around every page — renders the bottom navigation
// bar on most screens but hides it on fullscreen routes
// like sign-in, sign-up and list creation.

import { Outlet, useRouterState } from '@tanstack/react-router'
import { BottomNav } from '../ui/BottomNav'

const FULLSCREEN_ROUTES = ['/lists/new', '/signin', '/signup', '/forgot-password']

/** Screens that own the whole viewport — no bottom nav underneath. */
function isFullscreen(pathname: string): boolean {
  return (
    FULLSCREEN_ROUTES.includes(pathname) ||
    pathname.endsWith('/members') ||
    pathname.startsWith('/join/')
  )
}

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const showNav = !isFullscreen(pathname)

  return (
    <>
      <Outlet />
      {showNav && <BottomNav activeTab="listen" />}
    </>
  )
}
