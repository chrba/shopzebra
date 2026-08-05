/**
 * Available color themes for list icons and backgrounds.
 * Purely cosmetic, stored in local preferences.
 */
export type AccentColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow'

/**
 * Local display preferences for a shopping list.
 * Stored per-device, never synced to the backend.
 */
export type ListPreferences = {
  readonly color: AccentColor
  readonly emoji: string
}

/**
 * Local display preferences for a recipe — same idea as a list's: how it
 * looks on this device, never part of the shared recipe.
 */
export type RecipePreferences = {
  readonly color: AccentColor
  readonly emoji: string
}

const ACCENT_COLORS: readonly AccentColor[] = [
  'green',
  'blue',
  'red',
  'purple',
  'yellow',
]

function hashOf(id: string): number {
  let hash = 0
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

/**
 * The colour something wears until somebody picks one. Derived from the id
 * so it is stable and needs no stored state (domain-model.md §3) — and so
 * every screen showing the same list shows the same colour.
 */
export function defaultAccentColor(id: string): AccentColor {
  return ACCENT_COLORS[hashOf(id) % ACCENT_COLORS.length] ?? 'green'
}
