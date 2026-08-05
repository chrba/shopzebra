import { PageHeader } from '../../components/PageHeader'
import { Shimmer } from '../lists/overview/ListsPageSkeleton'

function noop() {}

/**
 * Shown while the server mints the invite token. The one screen that
 * genuinely has to wait: without a token there is no link, and only the
 * server may hand one out. So the chrome is real and the parts that need
 * the token shimmer in their final shape — the same treatment the boot
 * screen gets (design/pure/proposals/loading-b-skeleton.html).
 */
export function InvitePageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col pb-10">
      <PageHeader title="Einladen" backLabel="Zurück" onBack={noop} />

      <div className="flex flex-col items-center px-6 pt-2">
        {/* Where the QR code appears */}
        <Shimmer className="size-[200px] rounded-2xl" />
        {/* The link row */}
        <Shimmer className="mt-7 h-12 w-full rounded-2xl" delayMs={120} />
        {/* The three share buttons */}
        <div className="mt-4 flex w-full flex-col gap-2.5">
          <Shimmer className="h-[52px] w-full rounded-2xl" delayMs={200} />
          <Shimmer className="h-[52px] w-full rounded-2xl" delayMs={280} />
        </div>
      </div>
    </div>
  )
}
