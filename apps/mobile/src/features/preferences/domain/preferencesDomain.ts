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
