# Refactoring: Ordnerstruktur

> **Entschieden (2026-07-25): Bounded-Context-Struktur.** Jedes Top-Level-Feature ist ein Bounded Context mit `domain/`-Subfolder und UI-Aspekten mit Business-Namen (`overview/`, `manage/`, …). Der Alternativvorschlag `domain/` + `pages/` auf Top-Level ist **verworfen**: Er zerschneidet Features dauerhaft quer durch zwei Ordnerbäume und verletzt das High-Cohesion-Prinzip ([design-principals.md](./design-principals.md), Prinzip 10 — „eine User-Story = überwiegend ein Ordner"). Verbindliche Zielstruktur: Abschnitt „Konkrete Struktur mit aktuellem Code" unten; [domain-model.md](./domain-model.md) §4 ist daran angeglichen. Migrationsstand: [status.md](./status.md) §8.

---

# Verworfen: domain/ + pages/ Trennung

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

---

# Entschieden: Bounded-Context-Struktur (high cohesion)

Die Zielstruktur oben (`domain/` + `pages/`) folgt der Clean-Architecture-Idee und macht die Dependency Rule im Dateisystem sichtbar. Sie hat aber einen Nachteil: sie zerschneidet Features quer durch zwei Top-Level-Ordner. Wenn ein Feature wächst (z.B. "Listen": Übersicht, Erstellen, Bearbeiten, Teilen, Archiv), liegen die Teile davon dauerhaft in `domain/lists/` und mehreren `pages/`-Ordnern verstreut.

Wer **High Cohesion** und **domain-orientierte / feature-orientierte Organisation** höher gewichtet als die saubere Schicht-Trennung, kann stattdessen einen Bounded-Context-Ansatz wählen.

## Idee

Jedes Top-Level-Feature ist ein **Bounded Context** im DDD-Sinne. Innerhalb eines Features lebt:
- die Domain dieses Bounded Contexts (Slice, Types, Handler) in einem `domain/`-Subfolder
- die UI für die verschiedenen **Aspekte** dieses Contexts in eigenen Subfoldern

Cross-Feature-Kommunikation erfolgt ausschließlich über:
- **Type-Imports aus dem `domain/` eines anderen Features** (Read-Contracts)
- **Redux Actions** (broadcast — andere Slices reagieren via `extraReducers`)

Niemals importiert ein Feature die UI eines anderen Features.

## Regeln

- **Top-Level = Bounded Context.** Der Ordnername beschreibt eine Geschäftsfähigkeit (lists, shopping, recipes, meal-plan, family, activity).
- **`domain/` lebt im Feature**, das die Entity besitzt. Es gibt keinen Top-Level `domain/`-Ordner.
- **UI-Aspekte als Subfolder** mit Business-Namen: `overview/`, `manage/`, `detail/`, `catalog/`, `weekly/`. Kein `pages/`, kein `components/` als technische Container.
- **Owner-Regel bei Cross-Domain-Views:** Ein View, der mehrere Domains nutzt, lebt in dem Feature, dessen Domain primär *bearbeitet* wird. Lesende Domains werden via Type-Import angebunden.
- **Pure Consumer Features** (Features ohne eigene Domain) sind erlaubt, aber selten — meist ist das ein Zeichen, dass das Feature ein Aspekt eines anderen Bounded Contexts ist.

## Import-Regeln

Drei Regeln, die für **beide** Strukturansätze gelten (`domain/` + `pages/` ebenso wie Bounded Context):

1. **UI → beliebige `domain/`**: erlaubt. UI darf aus der eigenen Domain und aus jeder fremden Domain importieren (Selektoren, Actions, Types).
2. **`domain/` → UI**: nie. Domains kennen keine Pages.
3. **UI → andere UI**: nie. Weder Geschwister-Aspekt derselben Feature noch UI einer anderen Feature.

Cross-Feature-Verhalten läuft ausschließlich über **Redux Actions** (broadcast — andere Slices reagieren via `extraReducers`).

**Ausnahme zu Regel 3:** Geteilte UI-Helfer einer Feature dürfen an der Feature-Wurzel liegen (z.B. `auth/EmailInput.tsx`) und von Aspekten derselben Feature konsumiert werden. Sie haben keinen eigenen Aspekt-Ordner.

**Faustregel zum Selbsttest:** Wenn ich einen Aspekt-Ordner lösche und nur Code in `app/` und an der Feature-Wurzel bricht — richtig geschnitten. Wenn Geschwister-Ordner brechen — falsche Kopplung.

## Pros

- Maximale Cohesion: alles zu einer Geschäftsfähigkeit lebt unter einem Top-Level-Ordner
- Bei einer Änderung an "Listen" muss man nur `features/lists/` aufmachen
- Skaliert mit DDD-Denken: jedes Bounded Context ist isoliert lesbar und testbar
- Dependency Rule bleibt erhalten — `domain/` importiert weiterhin keine UI
- Auflösung der "false ownership": `manage-list/` ist explizit ein Aspekt von `lists/`, kein eigenständiges Feature

## Cons

- Die Schicht-Trennung ist nicht mehr im Top-Level sichtbar — man muss die `domain/`-Subfolder kennen
- Cross-Domain-Views erfordern eine Owner-Entscheidung (welches Feature ist "primär"?)
- Tiefere Verschachtelung als Option `domain/` + `pages/`

## Konkrete Struktur mit aktuellem Code

Aktueller Stand in `apps/mobile/src/features/`:

```
features/
  auth/
    state/
      authSlice.ts
      authThunks.ts
    SignInPage.tsx
    SignUpPage.tsx
    ForgotPasswordPage.tsx
  lists/
    model/
      listsSlice.ts
      listsClientStorageHandler.ts
      listsSyncHandler.ts
    ListsPage.tsx
    ListsHeader.tsx
    ListSummaryCard.tsx
    SummaryChips.tsx
    SwipeToDelete.tsx
  manage-list/
    CreateListPage.tsx
    EditListPage.tsx
    ListEditor.tsx
  profile/
    ProfilePage.tsx
```

Migriert nach Bounded-Context-Struktur (alle aktuell existierenden Dateien):

```
features/
  auth/
    domain/
      authSlice.ts
      authThunks.ts
    sign-in/
      SignInPage.tsx
    sign-up/
      SignUpPage.tsx
    forgot-password/
      ForgotPasswordPage.tsx
    profile/
      ProfilePage.tsx              ← war features/profile/,
                                    bleibt im auth-Context, weil Profil
                                    zur User-Identität gehört
  lists/
    domain/
      listsSlice.ts
      listsClientStorageHandler.ts
      listsSyncHandler.ts
    overview/
      ListsPage.tsx
      ListsHeader.tsx
      ListSummaryCard.tsx
      SummaryChips.tsx
      SwipeToDelete.tsx
    manage/
      CreateListPage.tsx           ← war features/manage-list/,
      EditListPage.tsx              jetzt als Aspekt der lists-Domain
      ListEditor.tsx
```

Geplante Erweiterungen würden so aussehen:

```
features/
  shopping/
    domain/
      shoppingSlice.ts
      shoppingSyncHandler.ts
    list-view/
      ShoppingListPage.tsx          ← liest lists/domain (welche Liste),
      CategorySection.tsx            schreibt shopping/domain (Items)
      ItemTile.tsx
  recipes/
    domain/
      recipesSlice.ts
    catalog/
      RecipesPage.tsx
    detail/
      RecipeDetailPage.tsx          ← darf lists/domain Actions dispatchen
                                    ("Zutaten zur Liste hinzufügen")
  meal-plan/
    domain/
      mealPlanSlice.ts
    weekly/
      WeekPlanPage.tsx              ← liest recipes/domain,
                                    schreibt meal-plan/domain + lists/domain
  family/
    domain/
      familySlice.ts
    settings/
      FamilySettingsPage.tsx
  activity/
    domain/
      activitySlice.ts
    feed/
      ActivityPage.tsx
```

## Vergleich der beiden Ansätze

| Kriterium                          | `domain/` + `pages/`          | Bounded Context              |
|------------------------------------|-------------------------------|------------------------------|
| Dependency Rule sichtbar           | ja, im Top-Level              | ja, in Subfoldern            |
| Cohesion innerhalb eines Features  | mittel (über Ordner verteilt) | hoch (alles zusammen)        |
| Skalierung auf 6+ Features         | flach, viele `pages/`         | tief, klare Bounded Contexts |
| Cross-Domain-Views                 | unproblematisch               | Owner-Entscheidung nötig     |
| Nähe zu DDD                        | mittel                        | hoch                         |
| False Ownership vermieden          | ja                            | ja, durch explizite Aspekte  |

Die Wahl fiel auf **maximale Kohäsion innerhalb einer Geschäftsfähigkeit** (Bounded Context) — die direkte Umsetzung von Prinzip 10. Der Preis ist bewusst akzeptiert: Die Schicht-Trennung ist erst in den Subfoldern sichtbar, und Cross-Domain-Views brauchen eine Owner-Entscheidung (der View lebt bei dem Feature, dessen Domain er primär *schreibt*).
