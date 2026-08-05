import { Card, CardContent } from '@/components/ui/card'
import { BottomNav } from '../../../ui/BottomNav'
import { ListsHeader } from './ListsHeader'

const CARD_STAGGER_MS = 150

function noop() {}

/** Grey placeholder block with a shimmer sweep running across it. */
export function Shimmer({
  className,
  delayMs = 0,
}: {
  readonly className: string
  readonly delayMs?: number
}) {
  return (
    <div className={`relative overflow-hidden bg-white/5 ${className}`}>
      <div
        className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
        style={delayMs > 0 ? { animationDelay: `${delayMs}ms` } : undefined}
      />
    </div>
  )
}

/** Placeholder with the exact shape of a ListSummaryCard. */
export function ListCardSkeleton({ delayMs }: { readonly delayMs: number }) {
  return (
    <Card className="gap-0 rounded-2xl px-4 py-5">
      <CardContent className="flex flex-col gap-2.5 px-0 py-0">
        <Shimmer className="size-14 rounded-full" delayMs={delayMs} />
        <Shimmer className="h-[15px] w-4/5 rounded-md" delayMs={delayMs} />
        <Shimmer className="h-3 w-3/5 rounded-md" delayMs={delayMs} />
      </CardContent>
    </Card>
  )
}

/**
 * Loading state shown while the app boots (session restore + server
 * hydration). The chrome — header and bottom nav — is real, chips and
 * list cards are shimmer placeholders with the exact shape of their
 * loaded counterparts, so switching to real data causes no layout
 * shift. Follows design/pure/proposals/loading-b-skeleton.html.
 */
export function ListsPageSkeleton() {
  return (
    <>
      <div className="min-h-screen pb-[100px]">
        <ListsHeader
          title="Meine Listen"
          profileName=""
          profileUserId=""
          onProfile={noop}
        />

        <div className="flex justify-center gap-2 px-5 pb-[18px]">
          <Shimmer className="h-[30px] w-[72px] rounded-md" />
          <Shimmer className="h-[30px] w-[68px] rounded-md" />
          <Shimmer className="h-[30px] w-[92px] rounded-md" />
        </div>

        <div className="grid grid-cols-2 gap-3 px-5">
          {[0, 1, 2, 3].map((index) => (
            <ListCardSkeleton key={index} delayMs={index * CARD_STAGGER_MS} />
          ))}
        </div>
      </div>
      <BottomNav activeTab="listen" />
    </>
  )
}
