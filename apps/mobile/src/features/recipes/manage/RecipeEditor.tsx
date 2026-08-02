import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Ingredient } from '../domain/recipesDomain'
import { parseIngredientLine, toIngredientLine } from './ingredientLine'
import { RecipeIconSheet } from './RecipeIconSheet'
import { DEFAULT_RECIPE_EMOJI } from './recipeEmojiCatalog'

/** Left arrow used in the nav header to go back to the collection. */
function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

/** The icon the recipe will show in the collection; tapping it opens the picker. */
function IconField({
  emoji,
  onPick,
}: {
  readonly emoji: string
  readonly onPick: () => void
}) {
  return (
    <div className="pt-2 pb-6 text-center">
      <Button
        variant="ghost"
        onClick={onPick}
        className="bg-secondary mx-auto flex size-24 items-center justify-center rounded-full p-0 text-5xl"
        aria-label="Icon wählen"
      >
        {emoji}
      </Button>
    </div>
  )
}

/** One labelled number field of the meta row. */
function NumberField({
  label,
  value,
  placeholder,
  suffix,
  onChange,
}: {
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly suffix?: string
  readonly onChange: (value: string) => void
}) {
  return (
    <div className="flex-1">
      <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
        {label}
      </label>
      <div className="relative">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-auto rounded-2xl px-[18px] py-3.5 text-[17px] font-semibold',
            suffix && 'pr-12',
          )}
        />
        {suffix && (
          <span className="text-muted-foreground absolute top-1/2 right-4 -translate-y-1/2 text-[13px] font-medium">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The ingredient lines. One free-text field per line, written the way it
 * would be on a note ("500g Spaghetti") — parsing happens on save.
 */
function IngredientRows({
  lines,
  onChange,
}: {
  readonly lines: readonly string[]
  readonly onChange: (lines: readonly string[]) => void
}) {
  return (
    <section className="pt-7">
      <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
        Zutaten
      </label>
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="z.B. 500g Spaghetti"
              value={line}
              onChange={(event) =>
                onChange(
                  lines.map((current, position) =>
                    position === index ? event.target.value : current,
                  ),
                )
              }
              className="h-auto flex-1 rounded-2xl px-[18px] py-3.5 text-[15px]"
            />
            <Button
              variant="ghost"
              onClick={() =>
                onChange(lines.filter((_, position) => position !== index))
              }
              className="text-muted-foreground size-11 shrink-0 rounded-full p-0 text-xl"
              aria-label="Zutat entfernen"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={() => onChange([...lines, ''])}
        className="text-teal mt-2 h-auto gap-1.5 px-0 text-[14px] font-semibold"
      >
        <span className="text-lg leading-none">＋</span> Zutat
      </Button>
    </section>
  )
}

/** The numbered preparation steps, one growing text box each. */
function StepRows({
  steps,
  onChange,
}: {
  readonly steps: readonly string[]
  readonly onChange: (steps: readonly string[]) => void
}) {
  return (
    <section className="pt-6">
      <label className="text-muted-foreground mb-2 block text-xs font-semibold tracking-wider uppercase">
        Zubereitung
      </label>
      <div className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="bg-secondary text-muted-foreground mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold">
              {index + 1}
            </div>
            <textarea
              placeholder="Schritt beschreiben..."
              value={step}
              rows={2}
              onChange={(event) =>
                onChange(
                  steps.map((current, position) =>
                    position === index ? event.target.value : current,
                  ),
                )
              }
              className={cn(
                'bg-input/30 min-h-[52px] flex-1 resize-none rounded-2xl border border-zinc-800 px-4 py-3 text-[15px]',
                'placeholder:text-muted-foreground focus-visible:border-teal outline-none',
              )}
            />
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={() => onChange([...steps, ''])}
        className="text-teal mt-2 h-auto gap-1.5 px-0 text-[14px] font-semibold"
      >
        <span className="text-lg leading-none">＋</span> Schritt
      </Button>
    </section>
  )
}

export type RecipeEditorValues = {
  readonly emoji: string
  readonly name: string
  readonly portions: number
  readonly durationMinutes: number | null
  readonly ingredients: readonly Ingredient[]
  readonly steps: readonly string[]
}

export type RecipeEditorResult = RecipeEditorValues

export const EMPTY_RECIPE: RecipeEditorValues = {
  emoji: DEFAULT_RECIPE_EMOJI,
  name: '',
  portions: 4,
  durationMinutes: null,
  ingredients: [],
  steps: [],
}

type RecipeEditorProps = {
  readonly title: string
  readonly submitLabel: string
  readonly initialValues: RecipeEditorValues
  readonly onSubmit: (result: RecipeEditorResult) => void
  /** Rendered above the save button — used for the members row on edit. */
  readonly extraSection?: ReactNode
}

/** Blank rows to write into, as the prototype starts out. */
function startingLines(existing: readonly string[], blanks: number): string[] {
  return existing.length > 0 ? [...existing] : Array<string>(blanks).fill('')
}

/** A whole number of at least one, or the fallback for anything else. */
function positiveNumber(input: string, fallback: number | null): number | null {
  const parsed = Number.parseInt(input, 10)
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed
}

/**
 * Full-screen form for a recipe: icon, name, portions, time, ingredient
 * lines and numbered preparation steps. Follows
 * design/pure/recipe-workflow/new-recipe.html.
 * @param props.title Page title in the header ("Neues Rezept", "Rezept bearbeiten").
 * @param props.submitLabel Label of the save button.
 * @param props.initialValues Pre-filled values — EMPTY_RECIPE when creating.
 * @param props.onSubmit Called with the entered recipe when the user saves.
 * @param props.extraSection Rendered above the save button (the members row).
 */
export function RecipeEditor({
  title,
  submitLabel,
  initialValues,
  onSubmit,
  extraSection,
}: RecipeEditorProps) {
  const navigate = useNavigate()

  const [emoji, setEmoji] = useState(initialValues.emoji)
  const [pickingIcon, setPickingIcon] = useState(false)
  const [name, setName] = useState(initialValues.name)
  const [portions, setPortions] = useState(String(initialValues.portions))
  const [duration, setDuration] = useState(
    initialValues.durationMinutes === null
      ? ''
      : String(initialValues.durationMinutes),
  )
  const [ingredientLines, setIngredientLines] = useState<readonly string[]>(
    startingLines(initialValues.ingredients.map(toIngredientLine), 3),
  )
  const [steps, setSteps] = useState<readonly string[]>(
    startingLines(initialValues.steps, 2),
  )
  const [error, setError] = useState('')

  const handleSubmit = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Bitte gib einen Rezeptnamen ein.')
      return
    }
    const ingredients = ingredientLines.flatMap((line) => {
      const parsed = parseIngredientLine(line)
      return parsed ? [parsed] : []
    })
    if (ingredients.length === 0) {
      setError('Bitte gib mindestens eine Zutat ein.')
      return
    }
    setError('')

    onSubmit({
      emoji,
      name: trimmedName,
      portions: positiveNumber(portions, 4) ?? 4,
      durationMinutes: positiveNumber(duration, null),
      ingredients,
      steps: steps.map((step) => step.trim()).filter((step) => step !== ''),
    })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between px-6 pt-2 pb-4">
        <Button
          variant="ghost"
          className="text-teal gap-1.5 px-0 text-[15px] font-semibold"
          onClick={() => navigate({ to: '/recipes' })}
        >
          <BackIcon />
          Rezepte
        </Button>
        <h1 className="font-display text-[17px] font-bold">{title}</h1>
        <div className="w-[70px]" />
      </header>

      <div className="flex-1 px-6 pb-6">
        <IconField emoji={emoji} onPick={() => setPickingIcon(true)} />

        <Input
          type="text"
          placeholder="Rezeptname"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError('')
          }}
          className="h-auto rounded-2xl px-[18px] py-4 text-[17px] font-semibold"
        />

        <div className="mt-4 flex gap-3">
          <NumberField
            label="Portionen"
            value={portions}
            onChange={setPortions}
          />
          <NumberField
            label="Zeit"
            value={duration}
            placeholder="30"
            suffix="Min"
            onChange={setDuration}
          />
        </div>

        <IngredientRows
          lines={ingredientLines}
          onChange={(lines) => {
            setIngredientLines(lines)
            setError('')
          }}
        />

        <StepRows steps={steps} onChange={setSteps} />

        {extraSection}

        <Button
          onClick={handleSubmit}
          className="mt-8 h-auto w-full rounded-[20px] bg-gradient-to-br from-[#4E9DA6] to-[#3A8A92] py-[18px] text-[17px] font-bold text-white shadow-[0_4px_20px_rgba(78,157,166,0.3)] transition-all active:scale-[0.98]"
        >
          {submitLabel}
        </Button>
        <p className="mt-2 min-h-[18px] text-center text-xs font-medium text-[#E07B7B]">
          {error}
        </p>
      </div>

      {pickingIcon && (
        <RecipeIconSheet
          onPick={setEmoji}
          onClose={() => setPickingIcon(false)}
        />
      )}
    </div>
  )
}
