import { useNavigate } from '@tanstack/react-router'
import { useAppSelector } from '../../app/store'
import { selectListById } from './listsSlice'

type ShoppingListPageProps = {
  readonly listId: string
}

export function ShoppingListPage({ listId }: ShoppingListPageProps) {
  const list = useAppSelector((state) => selectListById(state, listId))
  const navigate = useNavigate()

  if (!list) {
    void navigate({ to: '/lists' })
    return null
  }

  const checkedCount = 0
  const totalCount = list.itemCount
  const progressPercent = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0

  return (
    <div className="min-h-screen pb-[140px]">
      {/* Header */}
      <header className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer"
            onClick={() => void navigate({ to: '/lists' })}
            type="button"
            aria-label="Zurück zu Listen"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-text-dim">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <h1 className="flex-1 text-center font-display text-lg font-bold text-text-primary">{list.name}</h1>
          <button
            className="flex items-center justify-center size-8 bg-transparent border-none p-0 cursor-pointer opacity-50"
            type="button"
            aria-label="Liste bearbeiten"
          >
            <svg viewBox="0 0 24 24" className="size-[18px] fill-text-primary">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
        </div>

        {/* Progress row */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs font-medium text-text-dim whitespace-nowrap">
            {checkedCount} von {totalCount} Items
          </span>
          <div className="flex-1 h-[5px] bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-teal rounded-full transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {/* Divider */}
      <div className="border-t border-surface-border" />

      {/* Category sections — empty for new list */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center px-5 py-16 gap-4">
          <span className="text-5xl">{list.emoji}</span>
          <p className="text-sm text-text-dim text-center">
            Noch keine Items auf dieser Liste.
            <br />
            Füge unten dein erstes Item hinzu.
          </p>
        </div>
      )}

      {/* Floating input bar — above bottom nav */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] left-0 right-0 px-5 pb-2">
        <div className="flex items-center gap-3">
          <input
            className="flex-1 bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm font-medium text-text-primary font-[inherit] outline-none placeholder:text-text-dim focus:border-teal transition-[border-color] duration-200"
            type="text"
            placeholder="Item hinzufügen..."
          />
          <button
            className="flex size-11 shrink-0 items-center justify-center bg-surface border border-surface-border rounded-xl cursor-pointer p-0"
            type="button"
            aria-label="Spracheingabe"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-teal">
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
