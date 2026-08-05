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

/** Material "add" icon for the create-list button. */
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

type ListsHeaderProps = {
  readonly title: string
  /** Shown in the avatar — this device's name. */
  readonly profileName: string
  /** Decides the avatar's colour, exactly as it does for every member. */
  readonly profileUserId: string
  readonly onAdd: () => void
  readonly onProfile: () => void
}

/**
 * Top bar of the lists overview with title, add-button and profile-button.
 * @param props.title Header text displayed in the center.
 * @param props.onAdd Called when the "+" button is tapped.
 * @param props.onProfile Called when the profile avatar is tapped.
 */
export function ListsHeader({
  title,
  profileName,
  profileUserId,
  onAdd,
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

      <Button
        variant="ghost"
        size="icon-sm"
        className="text-teal"
        onClick={onAdd}
        aria-label="Neue Liste erstellen"
      >
        <PlusIcon />
      </Button>
    </header>
  )
}
