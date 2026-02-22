import { Outlet, useRouterState } from '@tanstack/react-router'
import { BottomNav } from '../ui/BottomNav'

const FULLSCREEN_ROUTES = ['/lists/new', '/signin', '/signup', '/forgot-password']

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const showNav = !FULLSCREEN_ROUTES.includes(pathname)

  return (
    <>
      <Outlet />
      {showNav && <BottomNav activeTab="listen" />}
    </>
  )
}
