import { Outlet } from '@tanstack/react-router'
import { BottomNav } from '../ui/BottomNav'

export function RootLayout() {
  return (
    <>
      <Outlet />
      <BottomNav activeTab="listen" />
    </>
  )
}
