# Design Prototypes — Regeln

## Overlay-Konsistenz

`list.html` und `category.html` haben jeweils ein Bottom-Sheet-Overlay fuer Produktdetails. **Diese Overlays muessen funktional identisch sein.** Wenn ein Feature in einem Overlay hinzugefuegt wird, muss es auch im anderen Overlay vorhanden sein.

### Gemeinsame Overlay-Features (beide Dateien):
- **Varianten-Chips** — alle Varianten (selected + unselected), togglebar
- **Eigene Sorte hinzufuegen** — Custom-Variant-Input mit +-Button
- **Menge** — Qty-Chips 1-5 + Custom-Input
- **Notiz** — Textarea (max 100 Zeichen), umbrechend (max 2 Zeilen), Zeichenzaehler nur sichtbar bei Focus, Text gedimmt wenn nicht aktiv (text-dim), kein Section-Label (nur Placeholder)

## Overlay-Layout

- Overlays duerfen **nicht scrollen** — Inhalt muss ohne Scroll sichtbar sein
- `list.html` Sheet hat kein `max-height` und kein `overflow-y: auto`
- Wenn Content zu viel wird: weniger Zeichen erlauben oder Elemente kompakter machen, NICHT scrollen

### Nur in `list.html`:
- **"Von der Liste entfernen"** — Remove-Button
- **Avatar-Badge** — farbiger Kreis mit Initial (wer hat es hinzugefuegt)
- **"von [Person]"** im Subtitle

### Nur in `category.html`:
- **Emoji aendern** — Emoji-Picker (Tap auf Emoji oeffnet Picker)

## Shared Storage Keys

Beide Dateien nutzen die gleichen localStorage-Keys pro Liste:
- `shopzebra_items_{listId}` — Einkaufslisten-Items
- `shopzebra_custom_variants_{listId}` — benutzerdefinierte Varianten
- `shopzebra_notes_{listId}` — Notizen pro Produkt

## Tile-Indikatoren (list.html)

- **Avatar** (bottom-left, 14px, ghost-style) — nur wenn von anderem Familienmitglied hinzugefuegt, dezent/subtil
- **Stift-Icon** (top-right, 12px, 35% opacity) — nur wenn Notiz vorhanden
- **Status-Line** (unter Name) — Varianten-Info ("2 Sorten" / Variantenname)
- **Keine Qty-Badges** auf Tiles — Mengeninfo ist bereits anderweitig sichtbar

## Einkaufsliste — Sortierung

Items im aktiven Grid sind **nach Kategorien sortiert** (Reihenfolge wie in CATEGORIES definiert: Obst & Gemuese → Milch & Kaese → Brot → Fleisch → Zutaten → Getraenke → Fruehstueck → Suesses → Tiefkuehl → Drogerie). Das entspricht dem typischen Supermarkt-Layout.

---

## Erkenntnisse aus Prototyping (Fehler nicht wiederholen!)

### UX-Fehler

1. **Label + Placeholder niemals doppeln.** Section-Label "NOTIZ" + Placeholder "Notiz…" = redundant. Wenn der Kontext klar ist, reicht der Placeholder allein. Kein Label noetig.

2. **Placeholder-Text muss minimal sein.** "z.B. brauch ich fuer backen..." ist zu lang, zu spezifisch, schlechte UX. Besser: "Notiz hinzufuegen…" — kurz, aktionsorientiert, kein Beispielsatz.

3. **Redundante Info nicht anzeigen.** Qty-Badges ("x4") auf Tiles waren ueberfluessig weil die Mengeninfo schon anderswo sichtbar war. Immer fragen: zeigt das was Neues?

4. **Avatare kontextabhaengig stylen.** Auf Tiles: subtil/ghost (14px, text-dim, kein Farbhintergrund). Im Overlay: praesentfarbig (30px, Member-Color). Gleiche Info, unterschiedliche visuelle Gewichtung je nach Kontext.

5. **Text-Zustaende klar trennen.** Geschriebener Text der gerade nicht editiert wird → gedimmt (text-dim). Nur bei aktivem Focus → text-primary. Gilt fuer Notizen und aehnliche optionale Felder.

### Technische Fehler

6. **Textarea auto-resize auch beim initialen Render.** Nicht nur auf `oninput` — wenn Content schon da ist (z.B. gespeicherte Notiz), muss die Hoehe sofort nach dem Rendern angepasst werden. Sonst kollabiert die Textarea auf 1 Zeile und schneidet Text ab.

7. **Kein overflow-y: auto auf Overlays.** Overlays/Sheets duerfen nicht scrollen. Kein `max-height` + `overflow` setzen. Content muss reinpassen. Wenn zu viel: Elemente kompakter machen oder Zeichenlimits anpassen.

8. **Zeichenlimit muss zum visuellen Platz passen.** Wenn 2 Zeilen erlaubt sind, muessen auch 2 volle Zeilen beschreibbar sein. Limit berechnen: Breite / durchschnittliche Zeichenbreite * Zeilen.

9. **Features immer in beiden Overlays gleichzeitig einbauen.** list.html und category.html teilen sich das Sheet-Konzept. Jedes neue Feature (Notiz, Varianten, etc.) muss sofort in beiden Dateien landen. Nie nur eins updaten.

10. **Varianten-Daten muessen in list.html verfuegbar sein.** Die PRODUCT_VARIANTS Map muss in list.html existieren damit das Overlay alle Varianten (auch nicht-ausgewaehlte) anzeigen kann — nicht nur die die auf der Liste sind.
