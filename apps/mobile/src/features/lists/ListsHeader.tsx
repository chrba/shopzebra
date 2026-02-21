import type { Theme } from '../../app/theme'

type ListsHeaderProps = {
  readonly title: string
  readonly theme: Theme
  readonly onThemeToggle: () => void
  readonly onAdd: () => void
}

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="white">
    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
  </svg>
)

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="white">
    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" />
  </svg>
)

export function ListsHeader({ title, theme, onThemeToggle, onAdd }: ListsHeaderProps) {
  return (
    <header className="relative flex items-center justify-between px-5 pt-4 pb-5">
      <button
        className="flex size-8 items-center justify-center bg-transparent border-none cursor-pointer opacity-50 p-0 transition-opacity duration-200 active:opacity-85 [&_svg]:size-[18px] [&_svg]:fill-white"
        onClick={onThemeToggle}
        type="button"
        aria-label="Theme wechseln"
      >
        {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
      </button>

      <h1 className="font-display text-2xl font-extrabold text-text-primary tracking-[-0.3px]">{title}</h1>

      <button
        className="flex size-8 items-center justify-center bg-surface border border-surface-border cursor-pointer p-0 transition-[background,border-color] duration-200 active:bg-surface-hover active:border-teal [&_svg]:size-5 [&_svg]:fill-teal"
        style={{ borderRadius: 'var(--icon-radius)' }}
        onClick={onAdd}
        type="button"
        aria-label="Neue Liste erstellen"
      >
        <svg viewBox="0 0 24 24">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
      </button>
    </header>
  )
}
