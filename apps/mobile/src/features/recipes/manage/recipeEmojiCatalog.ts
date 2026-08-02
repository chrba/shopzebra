// Reference data for the icon picker, taken from the recipe-workflow
// prototype (design/pure/recipe-workflow/new-recipe.html). The keywords are
// what the search box matches on, so "nudeln" finds the pasta icon.

export type EmojiChoice = {
  readonly emoji: string
  /** Space-separated German search terms for this icon. */
  readonly keywords: string
}

export type EmojiCategory = {
  readonly name: string
  readonly choices: readonly EmojiChoice[]
}

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    name: 'Gerichte',
    choices: [
      { emoji: '🍝', keywords: 'pasta spaghetti nudeln' },
      { emoji: '🍛', keywords: 'curry reis' },
      { emoji: '🍲', keywords: 'eintopf suppe topf' },
      { emoji: '🥘', keywords: 'pfanne schmortopf paella' },
      { emoji: '🍜', keywords: 'ramen nudelsuppe asiatisch' },
      { emoji: '🫕', keywords: 'fondue käse' },
      { emoji: '🥣', keywords: 'müsli bowl schüssel porridge' },
      { emoji: '🍱', keywords: 'bento japanisch' },
      { emoji: '🍚', keywords: 'reis schale' },
      { emoji: '🍙', keywords: 'onigiri reisbällchen' },
      { emoji: '🍘', keywords: 'reiskuchen' },
    ],
  },
  {
    name: 'Fast Food',
    choices: [
      { emoji: '🍕', keywords: 'pizza' },
      { emoji: '🍔', keywords: 'burger hamburger' },
      { emoji: '🌭', keywords: 'hotdog würstchen' },
      { emoji: '🍟', keywords: 'pommes frites' },
      { emoji: '🥪', keywords: 'sandwich brot' },
      { emoji: '🌮', keywords: 'taco mexikanisch' },
      { emoji: '🌯', keywords: 'burrito wrap' },
      { emoji: '🥙', keywords: 'pita döner kebab falafel' },
      { emoji: '🧆', keywords: 'falafel bällchen' },
      { emoji: '🥟', keywords: 'dumpling maultasche' },
      { emoji: '🥠', keywords: 'glückskeks' },
    ],
  },
  {
    name: 'Fleisch & Fisch',
    choices: [
      { emoji: '🍗', keywords: 'hähnchen huhn keule' },
      { emoji: '🍖', keywords: 'fleisch knochen rippe' },
      { emoji: '🥩', keywords: 'steak rind fleisch' },
      { emoji: '🥓', keywords: 'speck bacon' },
      { emoji: '🍣', keywords: 'sushi lachs fisch' },
      { emoji: '🍤', keywords: 'garnele shrimp' },
      { emoji: '🐟', keywords: 'fisch lachs forelle' },
      { emoji: '🍳', keywords: 'ei spiegelei bratei' },
      { emoji: '🥚', keywords: 'ei' },
    ],
  },
  {
    name: 'Obst',
    choices: [
      { emoji: '🍎', keywords: 'apfel rot' },
      { emoji: '🍐', keywords: 'birne' },
      { emoji: '🍊', keywords: 'orange mandarine' },
      { emoji: '🍋', keywords: 'zitrone' },
      { emoji: '🍌', keywords: 'banane' },
      { emoji: '🍉', keywords: 'wassermelone melone' },
      { emoji: '🍇', keywords: 'trauben weintrauben' },
      { emoji: '🍓', keywords: 'erdbeere' },
      { emoji: '🫐', keywords: 'blaubeere heidelbeere' },
      { emoji: '🍒', keywords: 'kirsche' },
      { emoji: '🍑', keywords: 'pfirsich' },
      { emoji: '🥭', keywords: 'mango' },
      { emoji: '🍍', keywords: 'ananas' },
      { emoji: '🥝', keywords: 'kiwi' },
      { emoji: '🥥', keywords: 'kokosnuss kokos' },
    ],
  },
  {
    name: 'Gemüse',
    choices: [
      { emoji: '🥕', keywords: 'möhre karotte' },
      { emoji: '🌽', keywords: 'mais' },
      { emoji: '🥦', keywords: 'brokkoli' },
      { emoji: '🥬', keywords: 'salat blattgemüse' },
      { emoji: '🥒', keywords: 'gurke' },
      { emoji: '🍆', keywords: 'aubergine' },
      { emoji: '🫑', keywords: 'paprika' },
      { emoji: '🌶️', keywords: 'chili scharf' },
      { emoji: '🍅', keywords: 'tomate' },
      { emoji: '🥑', keywords: 'avocado' },
      { emoji: '🧄', keywords: 'knoblauch' },
      { emoji: '🧅', keywords: 'zwiebel' },
      { emoji: '🍄', keywords: 'pilz champignon' },
      { emoji: '🥔', keywords: 'kartoffel' },
    ],
  },
  {
    name: 'Brot & Gebäck',
    choices: [
      { emoji: '🍞', keywords: 'brot toast' },
      { emoji: '🥐', keywords: 'croissant' },
      { emoji: '🥖', keywords: 'baguette' },
      { emoji: '🥨', keywords: 'brezel' },
      { emoji: '🥯', keywords: 'bagel' },
      { emoji: '🧇', keywords: 'waffel' },
      { emoji: '🥞', keywords: 'pancake pfannkuchen' },
      { emoji: '🧀', keywords: 'käse' },
    ],
  },
  {
    name: 'Süßes',
    choices: [
      { emoji: '🧁', keywords: 'cupcake muffin' },
      { emoji: '🍰', keywords: 'kuchen torte' },
      { emoji: '🎂', keywords: 'geburtstagskuchen torte' },
      { emoji: '🥧', keywords: 'pie kuchen' },
      { emoji: '🍩', keywords: 'donut' },
      { emoji: '🍪', keywords: 'keks cookie' },
      { emoji: '🍫', keywords: 'schokolade' },
      { emoji: '🍬', keywords: 'bonbon' },
      { emoji: '🍭', keywords: 'lolli lollipop' },
      { emoji: '🍮', keywords: 'pudding' },
      { emoji: '🍯', keywords: 'honig' },
      { emoji: '🍦', keywords: 'eis eiscreme' },
      { emoji: '🍨', keywords: 'eis becher' },
    ],
  },
  {
    name: 'Getränke',
    choices: [
      { emoji: '☕', keywords: 'kaffee' },
      { emoji: '🍵', keywords: 'tee' },
      { emoji: '🥛', keywords: 'milch' },
      { emoji: '🧋', keywords: 'bubble tea boba' },
      { emoji: '🥤', keywords: 'limo softdrink' },
      { emoji: '🍺', keywords: 'bier' },
      { emoji: '🍷', keywords: 'wein rotwein' },
      { emoji: '🧃', keywords: 'saft' },
    ],
  },
]

/** The icon a new recipe starts with, as in the prototype. */
export const DEFAULT_RECIPE_EMOJI = '🍝'

/** Icons whose name or keywords contain the term, across all categories. */
export function emojisMatching(term: string): readonly EmojiChoice[] {
  const needle = term.trim().toLowerCase()
  if (!needle) return []
  return EMOJI_CATEGORIES.flatMap((category) =>
    category.choices.filter((choice) => choice.keywords.includes(needle)),
  )
}
