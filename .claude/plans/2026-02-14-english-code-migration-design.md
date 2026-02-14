# English Code Migration Design

## Scope
Rename all German code-level identifiers to English. UI-visible text stays German.

## File Renames
| Old | New |
|---|---|
| listen.html | lists.html |
| liste.html | list.html |
| kategorie.html | category.html |
| neue-liste.html | new-list.html |
| einladen.html | invite.html |
| profil.html | profile.html |
| recipe-workflow/planen.html | recipe-workflow/planning.html |
| recipe-workflow/rezepte.html | recipe-workflow/recipes.html |
| recipe-workflow/rezept.html | recipe-workflow/recipe.html |
| recipe-workflow/neues-rezept.html | recipe-workflow/new-recipe.html |
| recipe-workflow/zutaten-checkout.html | recipe-workflow/ingredients-checkout.html |

## URL Parameters
- `?liste=` → `?list=`

## CSS Variables
- `--warenkorb-*` → `--cart-*`
- `--erledigt-*` → `--completed-*`

## CSS Classes
- `.warenkorb-*` → `.cart-*`
- `.erledigt-*` → `.completed-*`
- `@keyframes erledigtIncoming` → `@keyframes completedIncoming`

## JS Variables & Functions
- `ERLEDIGT_KEY` → `COMPLETED_KEY`
- `erledigtExpanded` → `completedExpanded`
- `loadErledigt()` → `loadCompleted()`
- `saveErledigt()` → `saveCompleted()`
- `renderErledigtSection()` → `renderCompletedSection()`
- Local vars: `erledigtItems` → `completedItems`, `erledigt` → `completed`

## HTML Element IDs
- `warenkorbCount` → `cartCount`
- `erledigtSection` → `completedSection`
- `erledigtToggle` → `completedToggle`
- `erledigtGrid` → `completedGrid`
- `erledigtCountBadge` → `completedCountBadge`
- `sumListen` → `sumLists`
- `sumMitglieder` → `sumMembers`

## localStorage Keys
- `shopzebra_listen` → `shopzebra_lists`
- `shopzebra_erledigt_*` → `shopzebra_completed_*`

## Category IDs
| Old | New |
|---|---|
| obst-gemuese | fruits-vegetables |
| milch-kaese | dairy-cheese |
| brot-gebaeck | bread-bakery |
| fleisch-fisch | meat-fish |
| zutaten-gewuerze | ingredients-spices |
| drogerie-haushalt | drugstore-household |

## Product IDs
All ~120 German product IDs renamed to English equivalents.

## Comments
All German comments translated to English.
