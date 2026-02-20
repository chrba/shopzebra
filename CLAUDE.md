# ShopZebra — Einkaufslisten-App für Familien

## Architecture

All code must follow the principles, decisions, and practices defined in the `architecture/` directory. **Read the relevant doc before you act:**

- **Technologie- oder Architektur-Entscheidung** (neue Library, neues Pattern, Ansatz wählen) → lies `architecture/design-principals.md` (Simple vs Easy) + `architecture/design-decisions.md`
- **Komponente, Hook, Slice oder Route implementieren** → lies `architecture/react-best-practices.md`
- **Neues Feature oder View bauen** → lies `architecture/product-spec.md` für Wireframes und Feature-Details
- **Ordner oder Package anlegen, Build-Fragen** → lies `architecture/project-structure.md` für Monorepo-Struktur

Die Kernregeln unten sind eine Kurzfassung — bei Zweifelsfällen immer das vollständige Dokument lesen.

### Kernregeln (Kurzfassung — Details in `architecture/`)

**Simple > Easy** — Bei jeder Technologie- und Implementierungsentscheidung: Nicht "wie schnell bin ich produktiv?" sondern "was passiert wenn es schwierig wird? Muss ich dann die ganze Maschine verstehen?" → `architecture/design-principals.md`

**State & Logik:**
- Gesamter App-State lebt im Redux Store. Kein `useState` für App-State — nur für ephemeren UI-State (Dropdown offen, Suchfeld-Input)
- Business-Logik gehört in den Reducer, nie in Komponenten. Komponente dispatcht nur ein Event, Reducer entscheidet was passiert
- Kein Immer — Reducers schreiben explizite immutable Updates (`{ ...state, items: [...state.items, newItem] }`). Eigenes `createSlice`/`createReducer` ohne Immer
- Kein redundanter State. Alles was berechenbar ist, wird berechnet — via Selektoren, nicht gespeichert
- Selektoren gehören in den Slice, nicht in die Komponente

**React-Patterns:**
- Kein `useEffect` für Datenladen → TanStack Route Loaders
- Kein `useEffect` für State-Ableitung → Selektoren oder Berechnung im Render
- Kein `useReducer`, kein `useContext` für App-State — Redux übernimmt das
- Custom Hooks bevorzugt für externe Systeme (WebSocket, Capacitor). Bevor du einen Hook für Domänen-Logik erstellst: Ist das simple oder nur easy? Oft ist ein Thunk die simplere Lösung

**Projekt-Struktur:**
- Feature-basierte Organisation in `features/`. Kein `shared/`, `common/`, `utils/`, `helpers/`-Ordner
- Kein `types/`-Verzeichnis — Types leben im Slice oder Feature-Ordner
- Barrel files (`index.ts`) nur als bewusste Public API einer Domäne, nicht als Convenience-Re-Export
- Domänen kommunizieren über Redux Actions, nie über direkte Imports

**TypeScript:**
- `any` vermeiden — `unknown` + Type Guards bevorzugen. `any` nur in Ausnahmen wenn es wirklich vereinfacht, nie als Default
- Kein `as` Type-Casting — nur wenn alle anderen Optionen erschöpft sind
- `const` statt `let`, `readonly` auf allen Properties
- `type` statt `interface` für Datenstrukturen. `interface` nur für Contracts (Klassen-Implementierung)
- Types beschreiben, Funktionen transformieren

---

## Vision

Eine Einkaufslisten-App, die Familien beim Planen und Einkaufen hilft. Fokus auf Echtzeit-Kollaboration, Meal Planning mit automatischer Listenerstellung und schnelle Bedienung im Supermarkt.

---

## App-Bereiche

- **Einkaufsliste** — Hauptscreen beim Einkaufen. One-Tap Check-off, Kategorien nach Laden-Layout, Fortschrittsbalken
- **Listen-Übersicht** — Alle Listen auf einen Blick, letzte Aktivität, Teilnehmer
- **Wochenplan** — Rezepte auf Tage verteilen, Zutaten mit einem Tap auf die Einkaufsliste
- **Rezepte** — Eigene Sammlung + Import per URL, Portionsgrößen anpassbar
- **Aktivitäten** — Family Feed mit Timeline, Emoji-Reaktionen, Schnell-Nachrichten
- **Einstellungen** — Über Profil-Icon: Familienmitglieder, Ernährungspräferenzen, Laden-Layouts

Navigation: Bottom Tab Bar (Listen | Planen | Rezepte | Aktivität) + Profil-Icon oben rechts.

Details zu Views und Wireframes: `architecture/product-spec.md`

---

## UX-Prinzipien

1. **Speed first** — Max. 1-2 Taps pro Aktion. Einhand-Bedienung am Einkaufswagen.
2. **Thumb-Zone** — Primäre Aktionen im unteren Bildschirmbereich.
3. **Visuell statt Text** — Icons, Illustrationen, farbcodierte Kategorien.
4. **Große Tap-Targets** — Kein versehentliches Abhaken beim Scrollen.
5. **Undo überall** — Jede Aktion rückgängig machbar.
6. **Offline-first** — Voll funktionsfähig ohne Netz, Sync wenn wieder online.
7. **Echtzeit-Sync** — Änderungen sofort auf allen Geräten.
8. **Hoher Kontrast** — Lesbar unter Neonlicht im Supermarkt.
9. **Dark Mode + Light Mode**
10. **Kein Haptisches Feedback** — Keine Vibration bei Check-off und wichtigen Aktionen, das nervt nur.
