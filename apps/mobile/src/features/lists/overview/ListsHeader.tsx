import { Button } from '@/components/ui/button'
import { memberAvatarColor, memberInitial } from '../domain/memberAvatar'

/**
 * You, as the others see you: the same circle, colour and letter that your
 * name wears next to your changes in a shared list. It stands here from
 * the first start, because the device names itself instead of asking.
 */
function ProfileAvatar({
  name,
  userId,
}: {
  readonly name: string
  readonly userId: string
}) {
  return (
    <span
      className="flex size-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
      style={{ backgroundColor: memberAvatarColor(userId) }}
    >
      {memberInitial(name)}
    </span>
  )
}

type ListsHeaderProps = {
  readonly title: string
  /** Shown in the avatar — this device's name. */
  readonly profileName: string
  /** Decides the avatar's colour, exactly as it does for every member. */
  readonly profileUserId: string
  readonly onProfile: () => void
}

/**
 * Top bar of the lists overview: profile on the left, title in the middle.
 *
 * No plus here — a new list is started from the dashed card at the end of
 * the grid, where the lists are. Two ways to the same page taught nothing
 * and cost a corner.
 * @param props.title Header text displayed in the center.
 * @param props.onProfile Called when the profile avatar is tapped.
 */
export function ListsHeader({
  title,
  profileName,
  profileUserId,
  onProfile,
}: ListsHeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-5 pt-4 pb-5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={onProfile}
        aria-label="Profil"
      >
        <ProfileAvatar name={profileName} userId={profileUserId} />
      </Button>

      <h1 className="font-display text-foreground text-2xl font-extrabold tracking-[-0.3px]">
        {title}
      </h1>

      {/* Balances the profile button so the title stays centred. */}
      <div className="size-8 shrink-0" />
    </header>
  )
}
