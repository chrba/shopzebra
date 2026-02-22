import type { Middleware } from '@reduxjs/toolkit'
import { applyThemeToDOM } from './theme'

export const themeMiddleware: Middleware = (_api) => (next) => (action) => {
  const result = next(action)

  const actionType = (action as { readonly type: string }).type

  if (actionType === 'app/appLoaded') {
    applyThemeToDOM('dark')
  }

  return result
}
