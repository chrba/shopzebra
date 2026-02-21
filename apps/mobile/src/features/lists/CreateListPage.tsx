import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch } from '../../app/store'
import { listCreated, type ListColor } from './listsSlice'

const EMOJI_OPTIONS = ['🛒', '🧴', '🎉', '🍎', '🔧', '🧀'] as const
const COLOR_OPTIONS: readonly ListColor[] = ['green', 'blue', 'red', 'purple', 'yellow'] as const

const colorBgMap: Record<ListColor, string> = {
  green: 'bg-green-bg',
  blue: 'bg-blue-bg',
  red: 'bg-red-bg',
  purple: 'bg-purple-bg',
  yellow: 'bg-yellow-bg',
}

export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState<string>(EMOJI_OPTIONS[0])
  const [color, setColor] = useState<ListColor>('green')

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    const action = dispatch(listCreated(trimmed, emoji, color))
    void navigate({ to: '/lists/$listId', params: { listId: action.payload.id } })
  }

  const handleCancel = () => {
    void navigate({ to: '/lists' })
  }

  return (
    <div className="min-h-screen pb-[100px]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-4 pb-5">
        <button
          className="flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
          onClick={handleCancel}
          type="button"
          aria-label="Zurück"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-text-dim">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h1 className="font-display text-xl font-bold text-text-primary">Neue Liste</h1>
        <div className="size-8" />
      </header>

      {/* Form */}
      <div className="flex flex-col gap-6 px-5 pt-4">
        <input
          className="bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm font-semibold text-text-primary font-[inherit] outline-none transition-[border-color] duration-200 placeholder:text-text-dim focus:border-teal"
          type="text"
          placeholder="Listenname…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          autoFocus
          maxLength={40}
        />

        {/* Emoji picker */}
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-dim">Symbol</span>
          <div className="flex gap-2 justify-center">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                className={`flex size-12 items-center justify-center rounded-xl bg-surface border-2 text-2xl cursor-pointer transition-[border-color,background] duration-200 p-0 active:bg-surface-hover ${emoji === e ? 'border-teal' : 'border-transparent'}`}
                onClick={() => setEmoji(e)}
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold text-text-dim">Farbe</span>
          <div className="flex gap-3 justify-center">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                className={`size-10 rounded-full border-2 cursor-pointer transition-[border-color,transform] duration-200 p-0 active:scale-90 ${colorBgMap[c]} ${color === c ? 'border-text-primary' : 'border-transparent'}`}
                onClick={() => setColor(c)}
                type="button"
                aria-label={c}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            className="bg-surface text-text-secondary border border-surface-border rounded-xl px-5 py-3 text-sm font-semibold font-[inherit] cursor-pointer transition-[background] duration-200 active:bg-surface-hover"
            onClick={handleCancel}
            type="button"
          >
            Abbrechen
          </button>
          <button
            className="flex-1 bg-teal text-white border-none rounded-xl p-3 text-sm font-bold font-[inherit] cursor-pointer transition-opacity duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={name.trim() === ''}
            type="button"
          >
            Erstellen
          </button>
        </div>
      </div>
    </div>
  )
}
