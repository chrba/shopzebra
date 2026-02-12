# ShopZebra — UX-Erkenntnisse & Entscheidungen

Gesammelte Learnings aus der Entwicklung. Dieses Dokument dient als Gedächtnis für zukünftige Entwicklung.

---

## Kategorie-Seite: Produkt-Tiles mit Varianten

### Problem: Varianten-Handling

**Kontext:** Viele Produkte haben Untertypen (Salat → Kopfsalat, Feldsalat, Eisbergsalat; Äpfel → Gala, Braeburn, Granny Smith). Diese müssen unabhängig voneinander mit eigener Menge auf die Einkaufsliste.

**Fehlversuch 1 — Flat List (jede Variante ein eigenes Tile):**
- Problem: Grid wird viel zu voll, Emojis wiederholen sich (5× das gleiche Salat-Emoji), unübersichtlich.

**Fehlversuch 2 — Single-Select Varianten (Long-Press → eine Variante wählen):**
- Problem 1: Nur EINE Variante pro Produkt möglich. Aber man braucht oft 3× Kopfsalat UND 1× Feldsalat gleichzeitig.
- Problem 2: Long-Press ist schlechte UX — nicht discoverable. Nutzer entdecken die Funktion nicht.
- Problem 3: Variante ersetzt den Produktnamen auf dem Tile → verwirrender Zustand.

**Lösung — Unabhängige Varianten mit Tap-to-Open Sheet:**
- Tap auf Varianten-Tile öffnet Bottom Sheet (statt Long-Press)
- Jede Variante hat eigenen +/- Stepper im Sheet
- Mehrere Varianten gleichzeitig wählbar, jede mit eigener Menge
- Tile zeigt aggregierten Status: "2 Sorten · 4 St"
- Datenmodell: Compound-IDs (`salat--Kopfsalat`) für unabhängige Speicherung

### UX-Prinzipien die sich bewährt haben

1. **Discoverability > Cleverness:** Long-Press ist elegant aber versteckt. Sichtbarer Hinweis "Tippen für Sorten" + direkter Tap ist immer besser als versteckte Gesten.

2. **Reale Einkaufsszenarien als Testfall:** Abstrakte Datenmodelle (1 Produkt = 1 Variante) scheitern an der Realität. Immer mit konkreten Beispielen testen: "Ich brauche 3 Kopfsalat, 1 Feldsalat und 1 Eisbergsalat."

3. **Unabhängigkeit statt Exklusivität:** Varianten sind KEINE Radio-Buttons (entweder/oder). Sie sind unabhängige Items die zufällig eine Kategorie teilen.

4. **Aggregation auf dem Tile:** Das Tile muss den Gesamtzustand lesbar zusammenfassen, ohne jedes Detail zu zeigen. "2 Sorten · 4 St" reicht — Details im Sheet.

5. **Fitts' Law im Supermarkt:** Touch-Targets müssen groß genug sein für Einhand-Bedienung am Einkaufswagen. Mindestens 34px für Stepper-Buttons, 44px+ für Tiles.

6. **Progressive Disclosure:** Grid zeigt Übersicht → Tap öffnet Details. Nicht alles auf einer Ebene zeigen.

---

## Allgemeine Erkenntnisse

### Bring!-Analyse
- Bring! nutzt Long-Press für Varianten → schlechte Discoverability
- Bring! erlaubt nur eine Variante pro Produkt → gleiche Limitation wie unser Fehlversuch 2
- Unser Ansatz (Tap + Multi-Select mit Steppern) ist Bring! hier überlegen

### Grid vs. Liste
- Grid-Layout mit Emoji-Tiles funktioniert gut für schnelles visuelles Scanning
- Kategorieseite nutzt 3-Spalten-Grid (min 100px pro Tile)
- Emoji als primärer visueller Anker — schneller erkennbar als Text

### Datenmodell
- `localStorage` mit flachem Item-Array
- Compound-IDs für Varianten: `{productId}--{variantName}`
- `parentId` Feld auf Varianten-Items für Aggregation
- Einfache Produkte haben nur `id`, keine `parentId`
- `getCategoryItems()` filtert nach `cat` Feld — funktioniert für beide Item-Typen

### Bottom Sheet Pattern
- Sheet mit Handle-Bar oben, Emoji + Titel im Header
- Scrollbar bei vielen Varianten
- Max 70% Bildschirmhöhe
- Slide-up Animation mit cubic-bezier(0.32, 0.72, 0, 1)
- Backdrop-Click schließt Sheet
