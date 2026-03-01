// Top-level component — renders the TanStack router which
// owns all page transitions and route-level data loading.

import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

export function App() {
  return <RouterProvider router={router} />
}
