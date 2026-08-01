import type { AuthUser } from '../../auth/domain/authSlice'

/** Shown when nobody ever supplied a name — see events.md on enrichment. */
export const MEMBER_NAME_FALLBACK = 'Mitglied'

/**
 * What to call a member on screen. Names travel in listMemberAdded and, for
 * the owner, in the list projection — but accounts created before names were
 * collected still have none. The signed-in user then falls back to their own
 * account details, everyone else to a neutral placeholder. Never the raw
 * user id: its first character would end up in the avatar circle.
 */
export function memberDisplayName(
  member: { readonly id: string; readonly name: string | null },
  me: AuthUser | null,
): string {
  if (member.name) return member.name
  if (me && member.id === me.userId) return me.name || me.email
  return MEMBER_NAME_FALLBACK
}
