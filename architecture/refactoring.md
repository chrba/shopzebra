# Refactoring: domain/ + pages/ Trennung

## Problem

Aktuell liegt alles flach unter `features/`. Domain-Logik (Slices, Actions, Types, Handlers) und UI-Code (Pages, Komponenten) leben im selben Ordner. Bei wenigen Features funktioniert das, aber mit Shopping, Recipes, MealPlan, Family, Activity, Preferences vor uns wird unklar was Anbieter und was Consumer ist.

Dazu kommt: Views sind gleichberechtigte Consumers aller Domains. `manage-list/` dispatcht Actions aus `lists/` genauso wie `ListsPage` — aber die aktuelle Struktur suggeriert, dass `ListsPage` eine Sonderbeziehung zu `lists/` hat, weil sie im selben Ordner liegt.

## Zielstruktur

```
src/
  domain/
    auth/
      authSlice.ts
      authThunks.ts
    lists/
      listsSlice.ts
      listsClientStorageHandler.ts
      listsSyncHandler.ts
    shopping/
      shoppingSlice.ts
      shoppingSyncHandler.ts
    recipes/
      recipesSlice.ts
    meal-plan/
      mealPlanSlice.ts
    family/
      familySlice.ts
    preferences/
      preferencesSlice.ts

  pages/
    sign-in/
      SignInPage.tsx
    sign-up/
      SignUpPage.tsx
    forgot-password/
      ForgotPasswordPage.tsx
    profile/
      ProfilePage.tsx
    lists-overview/
      ListsPage.tsx
      ListsHeader.tsx
      ListSummaryCard.tsx
      SummaryChips.tsx
      SwipeToDelete.tsx
      listsPageSelector.ts
    manage-list/
      CreateListPage.tsx
      EditListPage.tsx
      ListEditor.tsx
    shopping-list/
      ShoppingListPage.tsx
      CategorySection.tsx
      ItemTile.tsx
    recipes/
      RecipesPage.tsx
      RecipeDetailPage.tsx
    week-plan/
      WeekPlanPage.tsx
    activity/
      ActivityPage.tsx

  app/
    store.ts
    router.ts
    eventIdMiddleware.ts
    syncMiddleware.ts
    clientStorageMiddleware.ts
    ...
```

## Regeln

- `domain/` enthält Slices, Actions, Types, Selektoren, Sync-Handler, Storage-Handler. Kein UI-Code.
- `pages/` enthält Pages, Komponenten und Composed Selectors. Composed Selectors leben bei der Page die sie braucht.
- Abhängigkeitsrichtung: `pages/ → domain/`, nie umgekehrt. `domain/` importiert nichts aus `pages/`.
- Kein `model/`-Unterordner mehr nötig — der gesamte `domain/`-Ordner ist die Domain.
- `app/` bleibt unverändert (Store, Router, Middlewares).

## Warum domain/ und pages/?

- `domain` statt `model`: passt zu Event-Sourcing und DDD. "Model" klingt nach ORM/MVC.
- `pages` statt `views`: passt zur Router-Struktur (TanStack Routes). Jeder Ordner unter `pages/` entspricht einer gerouteten Page oder einem Flow.

## Pros

- Abhängigkeitsrichtung ist im Dateisystem sichtbar
- Bei 20+ Ordnern sofort klar was Anbieter und was Consumer ist
- Neue Entwickler verstehen die Architektur ohne Doku lesen zu müssen
- Kein View tut so als gehöre er exklusiv zu einer Domain
- Skaliert mit der geplanten App-Größe (Shopping, Recipes, MealPlan, Family, Activity, Preferences)

## Cons

- Composed Selectors (`listsPageSelector.ts`) leben in `pages/` obwohl sie Logik sind — akzeptabel weil sie nur für die jeweilige Page existieren
- Zwei Top-Level-Ordner statt einem — minimaler Navigations-Overhead

## Migration

Schrittweise möglich. Pro Feature:
1. `features/X/model/` oder `features/X/state/` → `domain/X/`
2. `features/X/*.tsx` → `pages/X/` (ggf. neuer Name nach Business-Zweck)
3. Import-Pfade anpassen
4. Alten Ordner löschen
