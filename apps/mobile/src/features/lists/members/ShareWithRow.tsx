import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="text-teal size-5 fill-current">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

type ShareWithRowProps = {
  /** Labels are resolved by the caller — see memberDisplayName. */
  readonly members: readonly {
    readonly id: string
    readonly label: string
  }[]
  readonly onInvite: () => void
}

/**
 * The "Teilen mit" row from design/pure/new-list.html: one circle per
 * member, plus a circle that opens the invite screen.
 *
 * The mockup lets you toggle avatars on and off, which presumes a pool of
 * people to pick from. There is none yet — these circles are the list's
 * actual members, and deselecting one would mean removing them. So they
 * are display-only until the friends list exists.
 */
export function ShareWithRow({ members, onInvite }: ShareWithRowProps) {
  return (
    <div className="px-6 pt-1 pb-4">
      <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
        Teilen mit
      </label>
      <div className="flex items-center gap-2.5">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex size-11 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ backgroundColor: memberAvatarColor(member.id) }}
            title={member.label}
          >
            {memberInitial(member.label)}
          </div>
        ))}
        <button
          type="button"
          className="border-border flex size-11 items-center justify-center rounded-full border-2 border-dashed transition-transform active:scale-90"
          aria-label="Mitglied einladen"
          onClick={onInvite}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}
