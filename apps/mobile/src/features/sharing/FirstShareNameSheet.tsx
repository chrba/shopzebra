import { useState } from 'react'
import { useAppDispatch } from '../../app/store'
import type { Identity } from '../auth/domain/authSlice'
import { ensureIdentity } from '../auth/domain/identityThunks'

/** True while nobody on this device has a name others could see. */
export function needsNameBeforeSharing(identity: Identity): boolean {
  return identity.kind === 'none'
}

type FirstShareNameSheetProps = {
  /**
   * The sharing step this sheet was opened for — minting the invite,
   * joining, accepting. Awaited, so the button keeps saying "Einen
   * Moment …" until the screen behind the sheet is actually ready.
   */
  readonly onDone: () => Promise<void> | void
  /** "Weiter zum Einladen" on the invite page, "Beitreten" when joining. */
  readonly confirmLabel?: string
}

/**
 * Screen 1A (design/pure/accountless/share-name.html). Shown once, over the
 * current page, before the very first invite or join. Confirming creates
 * the shadow account, moves everything written so far onto it and lets the
 * outbox flush. Whether it is shown at all is the caller's decision —
 * needsNameBeforeSharing answers it.
 */
export function FirstShareNameSheet({
  onDone,
  confirmLabel,
}: FirstShareNameSheetProps) {
  const dispatch = useAppDispatch()
  // Ephemeral UI state — the name becomes app state only once confirmed.
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await dispatch(ensureIdentity(name.trim()))
      await onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* max-w mirrors the app container (#root) so the sheet keeps its
          phone width on a desktop browser, like the mockup. */}
      <div className="fixed inset-0 z-40 mx-auto max-w-[430px] bg-black/55" />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px] rounded-t-[28px] border-t border-white/10 bg-[#1b1b21] px-6 pt-3 pb-[30px]">
        <div className="mx-auto mb-[18px] h-1 w-[38px] rounded-sm bg-white/20" />
        <h2 className="font-display mb-1.5 text-xl font-bold">
          Wie sollen dich andere sehen?
        </h2>
        <p className="text-muted-foreground mb-[18px] text-[13.5px] leading-relaxed">
          Der Name steht neben deinen Änderungen in geteilten Listen. Du kannst
          ihn jederzeit ändern.
        </p>
        <input
          className="focus:border-teal mb-4 w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-[15px] text-base font-semibold outline-none"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          autoFocus
        />
        <button
          className="bg-teal w-full rounded-[15px] p-4 text-base font-bold text-white disabled:opacity-50"
          disabled={name.trim() === '' || busy}
          onClick={() => void confirm()}
        >
          {busy ? 'Einen Moment …' : (confirmLabel ?? 'Weiter zum Einladen')}
        </button>
      </div>
    </>
  )
}
