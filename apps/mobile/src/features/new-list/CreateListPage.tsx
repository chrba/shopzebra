import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppDispatch } from '../../app/store'
import { listCreated, type ListColor, type Member } from '../lists/listsSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const EMOJIS = [
  '\u{1F6D2}',
  '\u{1F9F4}',
  '\u{1F389}',
  '\u{1F34E}',
  '\u{1F527}',
  '\u{1F9C0}',
  '\u{1F3E0}',
  '\u{1F381}',
  '\u{1F4DA}',
  '\u{1F3D5}',
  '\u{1F37D}',
  '\u2708',
] as const

const COLORS: readonly { readonly name: ListColor; readonly hex: string }[] = [
  { name: 'green', hex: '#6BBF6B' },
  { name: 'blue', hex: '#5BA8D5' },
  { name: 'red', hex: '#E07B7B' },
  { name: 'purple', hex: '#A07BCC' },
  { name: 'yellow', hex: '#E8C44A' },
]

const COLOR_BG_MAP: Record<ListColor, string> = {
  green: 'bg-[rgba(107,191,107,0.12)]',
  blue: 'bg-[rgba(91,168,213,0.12)]',
  red: 'bg-[rgba(224,123,123,0.12)]',
  purple: 'bg-[rgba(160,123,204,0.12)]',
  yellow: 'bg-[rgba(232,196,74,0.12)]',
}

const MEMBERS: readonly {
  readonly letter: string
  readonly name: string
  readonly color: string
}[] = [
  { letter: 'M', name: 'Mama', color: '#6BBF6B' },
  { letter: 'P', name: 'Papa', color: '#5BA8D5' },
  { letter: 'L', name: 'Lena', color: '#E07B7B' },
  { letter: 'O', name: 'Opa', color: '#A07BCC' },
]

export function CreateListPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const [emoji, setEmoji] = useState('\u{1F6D2}')
  const [name, setName] = useState('')
  const [color, setColor] = useState<ListColor>('green')
  const [selectedMembers, setSelectedMembers] = useState<readonly string[]>([
    'M',
    'P',
  ])
  const [error, setError] = useState('')

  const toggleMember = (letter: string) => {
    setSelectedMembers((prev) =>
      prev.includes(letter)
        ? prev.filter((m) => m !== letter)
        : [...prev, letter],
    )
  }

  const handleCreate = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Bitte einen Namen eingeben')
      return
    }
    setError('')

    const members: readonly Member[] = selectedMembers.map((letter) => {
      const member = MEMBERS.find((m) => m.letter === letter)
      return { letter, color: member?.color ?? '#888' }
    })

    dispatch(listCreated(trimmed, emoji, color, members))
    navigate({ to: '/lists' })
  }

  return (
    <div className="min-h-screen pb-10">
      {/* Nav Header */}
      <header className="flex items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => navigate({ to: '/lists' })}
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          Listen
        </Button>
        <h1 className="font-display text-[17px] font-bold">Neue Liste</h1>
        <div className="w-[70px]" />
      </header>

      {/* Emoji Preview */}
      <div className="px-6 pt-4 pb-6 text-center">
        <div
          className={cn(
            'relative mx-auto mb-4 flex size-24 items-center justify-center rounded-full text-5xl',
            COLOR_BG_MAP[color],
          )}
        >
          {emoji}
          {/* Pencil overlay */}
          <div className="border-background bg-secondary absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2">
            <svg viewBox="0 0 24 24" className="fill-muted-foreground size-3.5">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </div>
        </div>
        <p className="text-muted-foreground text-xs font-medium">
          Emoji wählen
        </p>
      </div>

      {/* Emoji Grid */}
      <div className="grid grid-cols-6 gap-1.5 px-6">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={cn(
              'flex aspect-square items-center justify-center rounded-[14px] text-2xl transition-all',
              e === emoji
                ? 'border-teal border-2 bg-[rgba(78,157,166,0.12)]'
                : 'bg-secondary border-2 border-transparent',
            )}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Name Input */}
      <div className="px-6 pt-6">
        <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
          Listenname
        </label>
        <Input
          type="text"
          placeholder="z.B. REWE Wocheneinkauf"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError('')
          }}
          className="h-auto rounded-2xl px-[18px] py-4 text-[17px] font-semibold"
        />
      </div>

      {/* Color Picker */}
      <div className="px-6 pt-6">
        <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
          Farbe
        </label>
        <div className="flex gap-3">
          {COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setColor(c.name)}
              className={cn(
                'size-11 rounded-full transition-all',
                c.name === color &&
                  'ring-background scale-110 ring-2 ring-offset-2 ring-offset-transparent',
              )}
              style={{
                backgroundColor: c.hex,
                borderColor: c.name === color ? 'white' : 'transparent',
                borderWidth: '3px',
              }}
              aria-label={c.name}
            />
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="px-6 pt-6">
        <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
          Teilen mit
        </label>
        <div className="flex items-center gap-2.5">
          {MEMBERS.map((m) => {
            const isSelected = selectedMembers.includes(m.letter)
            return (
              <button
                key={m.letter}
                type="button"
                onClick={() => toggleMember(m.letter)}
                className={cn(
                  'relative flex size-11 items-center justify-center rounded-full text-base font-bold text-white transition-all active:scale-90',
                  !isSelected && 'opacity-35',
                )}
                style={{ backgroundColor: m.color }}
                aria-label={`${m.name} ${isSelected ? 'entfernen' : 'hinzufügen'}`}
              >
                {m.letter}
                {isSelected && (
                  <div className="bg-teal border-background absolute -right-0.5 -bottom-0.5 flex size-[18px] items-center justify-center rounded-full border-2">
                    <svg viewBox="0 0 24 24" className="size-2.5 fill-white">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pt-8">
        <Button
          onClick={handleCreate}
          className="h-auto w-full rounded-[20px] bg-gradient-to-br from-[#4E9DA6] to-[#3A8A92] py-[18px] text-[17px] font-bold text-white shadow-[0_4px_20px_rgba(78,157,166,0.3)] transition-all active:scale-[0.98]"
        >
          Liste erstellen
        </Button>
        <p className="mt-2 min-h-[18px] text-center text-xs font-medium text-[#E07B7B]">
          {error}
        </p>
      </div>
    </div>
  )
}
