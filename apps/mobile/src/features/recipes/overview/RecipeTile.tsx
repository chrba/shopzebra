import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import type { AccentColor } from '../../preferences/domain/preferencesDomain'
import { InviteIcon } from '../../../components/InviteIcon'

const COLOR_BG_MAP: Record<AccentColor, string> = {
  green: 'bg-[rgba(107,191,107,0.12)] shadow-[0_0_20px_rgba(107,191,107,0.3)]',
  blue: 'bg-[rgba(91,168,213,0.12)] shadow-[0_0_20px_rgba(91,168,213,0.3)]',
  red: 'bg-[rgba(224,123,123,0.12)] shadow-[0_0_20px_rgba(224,123,123,0.3)]',
  purple: 'bg-[rgba(160,123,204,0.12)] shadow-[0_0_20px_rgba(160,123,204,0.3)]',
  yellow: 'bg-[rgba(232,196,74,0.12)] shadow-[0_0_20px_rgba(232,196,74,0.3)]',
}

const VISIBLE_AVATARS = 3

export type RecipeTileMember = {
  readonly id: string
  readonly initial: string
  readonly color: string
}

/**
 * Who this recipe is shared with, and — for its owner — the way to share it
 * further. The whole row is the tap target: a lone 24px plus would be far
 * below the 44px minimum on a two-column grid.
 */
function MembersRow({
  members,
  canInvite,
  onManageMembers,
}: {
  readonly members: readonly RecipeTileMember[]
  readonly canInvite: boolean
  readonly onManageMembers: () => void
}) {
  return (
    <button
      className="-mx-1 flex items-center gap-1 rounded-full px-1 py-1.5 active:opacity-70"
      aria-label="Mitglieder verwalten"
      onClick={(event) => {
        event.stopPropagation()
        event.preventDefault()
        onManageMembers()
      }}
    >
      {members.slice(0, VISIBLE_AVATARS).map((member) => (
        <span
          key={member.id}
          className="border-card -mr-2 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-bold text-white last:mr-0"
          style={{ backgroundColor: member.color }}
        >
          {member.initial}
        </span>
      ))}
      {members.length > VISIBLE_AVATARS && (
        <span className="text-muted-foreground ml-1 text-[11px] font-semibold">
          +{members.length - VISIBLE_AVATARS}
        </span>
      )}
      {canInvite && (
        <span className="border-border ml-1 flex size-6 items-center justify-center rounded-full border border-dashed">
          <InviteIcon className="text-teal size-3.5 fill-current" />
        </span>
      )}
    </button>
  )
}

type RecipeTileProps = {
  readonly recipeId: string
  readonly name: string
  readonly emoji: string
  readonly color: AccentColor
  readonly portions: number
  readonly durationMinutes: number | undefined
  /** Everyone but the signed-in user — their own membership is a given. */
  readonly members: readonly RecipeTileMember[]
  /**
   * Who this recipe belongs to — null for one's own. Named in the meta line,
   * so a shared recipe says whose it is before anyone taps it.
   */
  readonly ownerName: string | null
  /** Only the owner may invite (owner model, sharing-model.md). */
  readonly canInvite: boolean
}

/**
 * One recipe in the collection grid: icon, name, the line
 * "4 Portionen · 30 Min", and who it is shared with. Tapping the card opens
 * the recipe, tapping the member row opens sharing.
 */
export function RecipeTile({
  recipeId,
  name,
  emoji,
  color,
  portions,
  durationMinutes,
  members,
  ownerName,
  canInvite,
}: RecipeTileProps) {
  const navigate = useNavigate()

  const meta = [
    `${portions} Portionen`,
    ...(durationMinutes === undefined ? [] : [`${durationMinutes} Min`]),
    ...(ownerName === null ? [] : [ownerName]),
  ].join(' · ')

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => void navigate({ to: '/recipes/$recipeId', params: { recipeId } })}
      onKeyDown={(event) => {
        if (event.key === 'Enter')
          void navigate({ to: '/recipes/$recipeId', params: { recipeId } })
      }}
      className="bg-card flex cursor-pointer flex-col gap-2.5 rounded-[22px] border border-zinc-800 px-4 py-5 transition-transform active:scale-[0.97]"
    >
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-full text-4xl',
          COLOR_BG_MAP[color],
        )}
      >
        {emoji}
      </div>
      <div className="font-display text-[15px] leading-tight font-bold">
        {name}
      </div>
      {/* Never wraps: with a long owner name a second line would make the
          foreign tile taller than one's own, right next to it in the grid. */}
      <div className="text-muted-foreground truncate text-xs font-medium">
        {meta}
      </div>

      <MembersRow
        members={members}
        canInvite={canInvite}
        onManageMembers={() =>
          void navigate({
            to: '/recipes/$recipeId/members',
            params: { recipeId },
          })
        }
      />
    </div>
  )
}
