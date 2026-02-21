import type { Middleware } from '@reduxjs/toolkit'
import { applyThemeToDOM } from './theme'
import { setItem } from './storage'

const THEME_KEY = 'shopzebra_theme'

export const themeMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action)

  const actionType = (action as { readonly type: string }).type

  if (actionType === 'app/themeToggled' || actionType === 'app/appLoaded') {
    const state = api.getState() as { readonly app: { readonly theme: 'dark' | 'glass' } }
    const theme = state.app.theme
    applyThemeToDOM(theme)
    void setItem(THEME_KEY, theme)
  }

  return result
}
