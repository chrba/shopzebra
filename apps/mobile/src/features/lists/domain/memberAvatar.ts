// How a member is shown wherever the lists feature draws one: the same id
// always yields the same colour, on every device, without storing anything.

const MEMBER_AVATAR_COLORS: readonly string[] = [
  '#6BBF6B',
  '#5BA8D5',
  '#E07B7B',
  '#A07BCC',
  '#E8C44A',
]

function hashOf(id: string): number {
  let hash = 0
  for (const character of id) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return Math.abs(hash)
}

export function memberAvatarColor(memberId: string): string {
  return (
    MEMBER_AVATAR_COLORS[hashOf(memberId) % MEMBER_AVATAR_COLORS.length] ??
    '#888'
  )
}

/** First letter for the avatar circle; '?' when there is nothing to show. */
export function memberInitial(label: string): string {
  return label.charAt(0).toUpperCase() || '?'
}
