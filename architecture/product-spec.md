# Product Spec — ShopZebra

Detaillierte Produkt-Spezifikation: Views, Wireframes, Features und Wettbewerbs-Positionierung.

---

## Views

### 1. Einkaufsliste (Hauptscreen)

Der Screen, der beim Einkaufen benutzt wird.

```
┌──────────────────────────────┐
│ REWE Wocheneinkauf        ✏️ │
│ 8 von 15 Items         ━━━░ │
│──────────────────────────────│
│ ▾ Obst & Gemüse (3)         │
│  [Äpfel 2kg] [Möhren]       │
│  [Zitronen 3St]              │
│──────────────────────────────│
│ ▾ Milchprodukte (2)          │
│  [Milch 1.5%] [Gouda]       │
│──────────────────────────────│
│ ▸ Erledigt (8)               │
│──────────────────────────────│
│ ┌──────────────────────┐ 🎤 │
│ │ Item hinzufügen...   │    │
│ └──────────────────────┘    │
└──────────────────────────────┘
```

- Kategorien einklappbar, sortiert nach Laden-Layout
- Grid- oder Listenansicht umschaltbar
- Erledigte Items unten, einklappbar, mit Undo
- Floating Eingabeleiste + Spracheingabe
- Fortschrittsbalken oben
- One-Tap Check-off mit haptischem Feedback
- Große Tap-Targets für Einhand-Bedienung

### 2. Listen-Übersicht

Alle Einkaufslisten auf einen Blick.

```
┌──────────────────────────────┐
│ Meine Listen              [+]│
│──────────────────────────────│
│ REWE Wocheneinkauf           │
│    15 Items · 3 Mitglieder   │
│    Zuletzt: Mama +Milch 14:02│
│──────────────────────────────│
│ dm Drogerie                  │
│    4 Items · Papa             │
│──────────────────────────────│
│ Geburtstagsparty Lena        │
│    22 Items · Familie         │
└──────────────────────────────┘
```

- Letzte Aktivität pro Liste sichtbar
- Anzahl Items + Teilnehmer auf einen Blick
- Schnelles Erstellen neuer Listen
- Listen teilen per Link/QR-Code

### 3. Wochenplan / Meal Planning

Mahlzeiten auf Wochentage verteilen, dann Zutaten auf die Einkaufsliste schieben.

```
┌──────────────────────────────┐
│ KW 7 · Februar            ◀▶│
│──────────────────────────────│
│ Mo  Spaghetti Bolognese      │
│ Di  Gemüsecurry              │
│ Mi  Reste / Auswärts         │
│ Do  Hähnchen mit Reis        │
│ Fr  Pizza (selbstgemacht)    │
│ Sa  Brunch                   │
│ So  Sonntagsbraten           │
│──────────────────────────────│
│ [Zutaten auf Einkaufsliste]  │
└──────────────────────────────┘
```

- Rezepte per Drag-and-Drop oder Tap auf Tage setzen
- Alle Familienmitglieder sehen den Plan ("Was gibt's heute?")
- Portionsgrößen anpassbar (Standard: Familiengröße)
- Wochennavigation vor/zurück

#### Kern-Workflow: Zutaten auf Einkaufsliste

Wenn man "Zutaten auf Einkaufsliste" tippt:

```
┌──────────────────────────────┐
│ Zutaten für Mo–So            │
│──────────────────────────────│
│ ✅ Spaghetti 500g            │
│ ✅ Hackfleisch 400g          │
│ ✅ Kokosmilch 1 Dose         │
│ ✅ Currypaste 2 EL           │
│ ☐  Salz  (Basics)           │
│ ☐  Pfeffer (Basics)         │
│──────────────────────────────│
│ Auf welche Liste?            │
│ ┌──────────────────────────┐ │
│ │ ▼ REWE Wocheneinkauf    │ │
│ └──────────────────────────┘ │
│                              │
│ [Ausgewählte hinzufügen (12)]│
└──────────────────────────────┘
```

- Alle Zutaten vorausgewählt
- Basics (Salz, Pfeffer, Öl) standardmäßig abgewählt
- Dropdown zur Listenwahl
- Mengen automatisch zusammenrechnen (2 Rezepte brauchen Zwiebeln → "Zwiebeln 3St")
- Duplikate erkennen: Hinweis wenn Item schon auf der Liste steht

### 4. Rezepte

Eigene Rezeptsammlung und Import.

```
┌──────────────────────────────┐
│ Rezepte          🔍 [Import] │
│──────────────────────────────│
│ ▾ Eigene Rezepte (12)        │
│   Omas Gulasch · 4 Pers      │
│   Pasta Carbonara · 2 Pers   │
│   Gemüsecurry · 4 Pers       │
│──────────────────────────────│
│ ▾ Inspiration                │
│   Saisonale Vorschläge       │
│   Schnell & Einfach          │
│   Familien-Favoriten         │
└──────────────────────────────┘
```

- Rezepte importieren per URL oder manuell erstellen
- Portionsgröße anpassbar
- Jedes Rezept hat: Name, Zutaten mit Mengen, Zubereitung, Foto
- Zutaten direkt zur Einkaufsliste hinzufügen (auch ohne Wochenplan)
- In den Wochenplan ziehen

### 5. Aktivitäten / Family Feed

Timeline aller Änderungen und Familien-Kommunikation.

```
┌──────────────────────────────┐
│ Aktivitäten                  │
│──────────────────────────────│
│ 14:02 Mama hat Milch hinzu-  │
│       gefügt → REWE Liste    │
│       ❤️ 👍                   │
│──────────────────────────────│
│ 13:45 Papa hat 5 Items       │
│       abgehakt               │
│──────────────────────────────│
│ 13:30 Lena: "Können wir      │
│       Schokopudding kaufen?" │
│──────────────────────────────│
│ [Nachricht senden...]        │
│ [Ich gehe einkaufen!]        │
└──────────────────────────────┘
```

- Timeline aller Listen-Änderungen
- Emoji-Reaktionen auf Einträge
- Vordefinierte Schnell-Nachrichten ("Ich gehe einkaufen!", "Bitte noch Milch!")
- Freie Textnachrichten

### 6. Einstellungen

Kein eigener Tab — erreichbar über Profil-Icon oben rechts.

- Familienmitglieder verwalten (einladen, entfernen)
- Ernährungspräferenzen pro Person (Allergien, vegetarisch, glutenfrei)
- Benachrichtigungen konfigurieren (pro Liste, pro Aktionstyp)
- Laden-Layouts anpassen (Kategorie-Reihenfolge pro Laden)
- Theme (Dark/Light)
- Kundenkarten-Wallet

---

## Navigation (Bottom Tab Bar)

```
┌──────┬───────┬────────┬──────────┐
│Listen│Planen │Rezepte │Aktivität │
└──────┴───────┴────────┴──────────┘
```

- **Listen** → Listen-Übersicht, Tap auf Liste → Einkaufsliste
- **Planen** → Wochenplan
- **Rezepte** → Rezeptsammlung
- **Aktivität** → Family Feed (Badge mit Anzahl neuer Updates)
- **Profil-Icon** oben rechts → Einstellungen

---

## Kern-Features

### Einkaufsliste
- Items hinzufügen per Tippen, Autocomplete, Spracheingabe
- Automatische Kategorie-Sortierung nach Supermarkt-Gängen
- Mengen und Notizen pro Item
- One-Tap Check-off mit Undo
- Fortschrittsanzeige
- Grid- und Listenansicht

### Kollaboration
- Listen teilen per Link/QR-Code
- Echtzeit-Sync über alle Geräte
- Push-Benachrichtigungen bei Änderungen
- Attribution: wer hat was hinzugefügt
- Schnell-Nachrichten und Emoji-Reaktionen
- "Ich gehe einkaufen!" Notification

### Meal Planning
- Wochenplan mit Drag-and-Drop
- Rezepte auf Tage verteilen
- Alle Zutaten mit einem Tap auf die Einkaufsliste
- Mengen automatisch zusammenrechnen
- Basics (Salz, Pfeffer) standardmäßig ausschließen
- Duplikaterkennung

### Rezepte
- Eigene Rezepte erstellen
- Import per URL
- Portionsgrößen anpassbar
- Direkt zur Liste oder in den Wochenplan

### Smart Features
- Autocomplete mit Kaufhistorie (66% der Items wiederholen sich)
- Komplementäre Vorschläge (Spaghetti → Parmesan vorschlagen)
- Personalisierte Laden-Sortierung
- Wiederkehrende Items

---

## Wettbewerbs-Positionierung

| Feature | Bring! | ShopZebra |
|---------|--------|-----------|
| Visuelle Einkaufsliste | ✅ | ✅ |
| Echtzeit-Kollaboration | ✅ | ✅ |
| Rezepte | ✅ (nur Inspiration) | ✅ (eigene + Import) |
| Wochenplan / Meal Planning | ❌ | ✅ |
| Rezept → automatisch Einkaufsliste | ❌ (nur einzeln) | ✅ (ganzer Wochenplan) |
| Mengen zusammenrechnen | ❌ | ✅ |
| Family Feed / Aktivitäten | ✅ | ✅ |
| Werbefrei | ❌ (Free-Version) | ✅ |
| Laden-spezifische Sortierung | Teilweise | ✅ |
