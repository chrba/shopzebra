import { getItem } from './storage'

export type Theme = 'dark' | 'glass'

const THEME_KEY = 'shopzebra_theme'

export async function loadTheme(): Promise<Theme> {
  const stored = await getItem(THEME_KEY)
  return stored === 'glass' ? 'glass' : 'dark'
}

export function applyThemeToDOM(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}
