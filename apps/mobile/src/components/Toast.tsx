import { useCallback, useState } from 'react'

/**
 * The transient confirmation strip from design/pure/invite.html.
 * Ephemeral view state, so useState rather than the store.
 */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null)

  const show = useCallback((text: string) => {
    setMessage(text)
    window.setTimeout(() => setMessage(null), 2000)
  }, [])

  const element = message ? (
    <div className="bg-foreground text-background fixed bottom-8 left-1/2 -translate-x-1/2 rounded-full px-5 py-2.5 text-[14px] font-semibold shadow-lg">
      {message}
    </div>
  ) : null

  return { show, element }
}
