// Applies the theme to the DOM when the app finishes loading.
//
// The store holds the theme preference, but CSS needs a class
// on <html> to activate dark/light mode. This middleware
// bridges the gap: when appLoaded fires it updates the DOM.

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
