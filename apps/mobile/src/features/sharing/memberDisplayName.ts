import type { Identity } from '../auth/domain/authSlice'

/** Shown when nobody ever supplied a name — see events.md on enrichment. */
export const MEMBER_NAME_FALLBACK = 'Mitglied'

/**
 * What to call a member on screen. Names travel in listMemberAdded and, for
 * the owner, in the list projection — but a guest is asked for a name only
 * at the first share, so before that nobody has one. This device then falls
 * back to its own display name, everyone else to a neutral placeholder.
 * Never the raw user id: its first character would end up in the avatar
 * circle.
 */
export function memberDisplayName(
  member: { readonly id: string; readonly name: string | null },
  me: Identity,
): string {
  if (member.name) return member.name
  if (me.kind !== 'none' && member.id === me.userId) {
    return me.name || MEMBER_NAME_FALLBACK
  }
  return MEMBER_NAME_FALLBACK
}
