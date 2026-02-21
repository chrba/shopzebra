export type Theme = 'dark'

export async function loadTheme(): Promise<Theme> {
  return 'dark'
}

export function applyThemeToDOM(_theme: Theme): void {
  document.documentElement.classList.add('dark')
}
