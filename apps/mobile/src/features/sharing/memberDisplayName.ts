/** Shown when nobody ever supplied a name — see events.md on enrichment. */
export const MEMBER_NAME_FALLBACK = 'Mitglied'

/** Whoever is looking at the screen — id and name, both always present. */
export type Viewer = {
  readonly id: string
  readonly name: string
}

/**
 * What to call a member on screen. Names travel in listMemberAdded and, for
 * the owner, in the list projection — but neither exists before the first
 * sync, so the viewer's own row would have no name at all. It comes from
 * the device instead, which has carried one since its first start.
 *
 * Never the raw user id: its first character would end up in the avatar
 * circle.
 */
export function memberDisplayName(
  member: { readonly id: string; readonly name: string | null },
  viewer: Viewer,
): string {
  if (member.name) return member.name
  if (member.id === viewer.id) return viewer.name || MEMBER_NAME_FALLBACK
  return MEMBER_NAME_FALLBACK
}
