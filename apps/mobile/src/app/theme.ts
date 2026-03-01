// Theme utilities — loading, storing and applying the
// color scheme. Currently dark-only; will support light
// mode and system preference detection later.

export type Theme = 'dark'

export async function loadTheme(): Promise<Theme> {
  return 'dark'
}

export function applyThemeToDOM(_theme: Theme): void {
  document.documentElement.classList.add('dark')
}
