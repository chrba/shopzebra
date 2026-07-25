import { Badge } from '@/components/ui/badge'

/** Small "add" icon inside the members badge chip. */
function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      className="fill-teal ml-0.5"
    >
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

type SummaryChipsProps = {
  readonly listCount: number
  readonly itemCount: number
  readonly memberCount: number
}

/**
 * Row of badge chips below the header showing list count, item count, member count.
 * @param props.listCount Total number of shopping lists.
 * @param props.itemCount Total number of items across all lists.
 * @param props.memberCount Total number of family members with access.
 */
export function SummaryChips({
  listCount,
  itemCount,
  memberCount,
}: SummaryChipsProps) {
  return (
    <div className="flex justify-center gap-2 px-5 pb-[18px]">
      <Badge
        variant="secondary"
        className="gap-1.5 px-3.5 py-[7px] text-xs font-semibold"
      >
        <span className="text-teal font-bold">{listCount}</span> Listen
      </Badge>
      <Badge
        variant="secondary"
        className="gap-1.5 px-3.5 py-[7px] text-xs font-semibold"
      >
        <span className="text-teal font-bold">{itemCount}</span> Items
      </Badge>
      <Badge
        variant="secondary"
        className="cursor-pointer gap-1.5 px-3.5 py-[7px] text-xs font-semibold"
        asChild
      >
        <button type="button">
          <span className="text-teal font-bold">{memberCount}</span> Mitglieder
          <PlusIcon />
        </button>
      </Badge>
    </div>
  )
}
