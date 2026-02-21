type BottomNavProps = {
  readonly activeTab: 'listen' | 'planen' | 'rezepte' | 'aktivitaet'
  readonly activityBadgeCount?: number
}

export function BottomNav({ activeTab, activityBadgeCount }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-100 flex justify-around items-start bg-nav-bg nav-blur border-t border-nav-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
      style={{ transition: 'background 0.4s ease, border-color 0.3s ease' }}
    >
      <button
        className={`relative flex flex-col items-center gap-[5px] bg-transparent border-none p-0 min-w-14 text-[10px] font-semibold font-[inherit] cursor-pointer transition-colors duration-200 no-underline [&_svg]:size-6 [&_svg]:fill-current ${activeTab === 'listen' ? 'text-teal nav-active-indicator' : 'text-text-dim'}`}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
        </svg>
        <span>Listen</span>
      </button>

      <button
        className={`relative flex flex-col items-center gap-[5px] bg-transparent border-none p-0 min-w-14 text-[10px] font-semibold font-[inherit] cursor-pointer transition-colors duration-200 no-underline [&_svg]:size-6 [&_svg]:fill-current ${activeTab === 'planen' ? 'text-teal nav-active-indicator' : 'text-text-dim'}`}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
        </svg>
        <span>Planen</span>
      </button>

      <button
        className={`relative flex flex-col items-center gap-[5px] bg-transparent border-none p-0 min-w-14 text-[10px] font-semibold font-[inherit] cursor-pointer transition-colors duration-200 no-underline [&_svg]:size-6 [&_svg]:fill-current ${activeTab === 'rezepte' ? 'text-teal nav-active-indicator' : 'text-text-dim'}`}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z" />
        </svg>
        <span>Rezepte</span>
      </button>

      <button
        className={`relative flex flex-col items-center gap-[5px] bg-transparent border-none p-0 min-w-14 text-[10px] font-semibold font-[inherit] cursor-pointer transition-colors duration-200 no-underline [&_svg]:size-6 [&_svg]:fill-current ${activeTab === 'aktivitaet' ? 'text-teal nav-active-indicator' : 'text-text-dim'}`}
        type="button"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
        </svg>
        <span>Aktivität</span>
        {activityBadgeCount !== undefined && activityBadgeCount > 0 && (
          <span className="absolute -top-1 right-1 flex size-[18px] items-center justify-center rounded-full bg-orange text-white text-[10px] font-bold shadow-[0_0_12px_rgba(232,146,58,0.5)]">
            {activityBadgeCount}
          </span>
        )}
      </button>
    </nav>
  )
}
