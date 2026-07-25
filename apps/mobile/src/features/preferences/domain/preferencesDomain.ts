/**
 * Available color themes for list icons and backgrounds.
 * Purely cosmetic, stored in local preferences.
 */
export type ListColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow'

/**
 * Local display preferences for a shopping list.
 * Stored per-device, never synced to the backend.
 */
export type ListPreferences = {
  readonly color: ListColor
  readonly emoji: string
}
