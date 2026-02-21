type SummaryChipsProps = {
  readonly listCount: number
  readonly itemCount: number
  readonly memberCount: number
}

export function SummaryChips({ listCount, itemCount, memberCount }: SummaryChipsProps) {
  return (
    <div className="flex gap-2 px-5 pb-[18px] justify-center">
      <div className="flex items-center gap-1.5 bg-chip-bg border border-chip-border rounded-chip px-3.5 py-[7px] text-xs font-semibold text-text-secondary chip-blur">
        <span className="text-teal font-bold">{listCount}</span> Listen
      </div>
      <div className="flex items-center gap-1.5 bg-chip-bg border border-chip-border rounded-chip px-3.5 py-[7px] text-xs font-semibold text-text-secondary chip-blur">
        <span className="text-teal font-bold">{itemCount}</span> Items
      </div>
      <button
        className="flex items-center gap-1.5 bg-chip-bg border border-chip-border rounded-chip px-3.5 py-[7px] text-xs font-semibold text-text-secondary chip-blur cursor-pointer font-[inherit]"
        type="button"
      >
        <span className="text-teal font-bold">{memberCount}</span> Mitglieder
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="var(--teal)"
          className="ml-0.5"
        >
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
    </div>
  )
}
