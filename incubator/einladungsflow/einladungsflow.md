# Einladungsflow — Familienmitglied einladen

Drei Varianten, wie der Einladungsflow aussehen kann.
Kontext: Erreichbar aus Einstellungen oder direkt aus einer Liste heraus.

---

## Variante 1: Share-Sheet mit QR-Code + Link

**Konzept:** Einzelne Fullscreen-Page mit grossem QR-Code im Zentrum. Darunter ein kopierbarer Link und native Share-Optionen. Minimalistisch, ein Screen, kein Multi-Step.

### Flow

```
Einstellungen / Liste
        │
        ▼
  [+ Mitglied einladen]
        │
        ▼
┌─────────────────────────────────┐
│ Einladungs-Screen               │
│ (QR-Code + Link + Share)        │
│                                 │
│ Empfaenger scannt / klickt Link │
└────────────┬────────────────────┘
             │
             ▼
   Empfaenger oeffnet App
   → automatisch der Familie
     zugeordnet
```

### Screen: Einladung senden

```
┌──────────────────────────────┐
│ ←  Mitglied einladen         │
│──────────────────────────────│
│                              │
│      ┌────────────────┐      │
│      │                │      │
│      │   ██ QR ██     │      │
│      │   ██ CODE██    │      │
│      │   ██     ██    │      │
│      │                │      │
│      └────────────────┘      │
│                              │
│  Scanne den Code oder teile  │
│  den Einladungslink:         │
│                              │
│ ┌──────────────────────┬───┐ │
│ │ shopzebra.app/j/Ax9f │ 📋│ │
│ └──────────────────────┴───┘ │
│                              │
│  Link gueltig fuer 7 Tage   │
│                              │
│ ┌──────────────────────────┐ │
│ │    📤  Link teilen       │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │    💬  Per WhatsApp      │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │    ✉️  Per E-Mail        │ │
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘
```

### Implementierungsdetails (HTML)

- **Layout:** Zentrierter Content, kein Scroll noetig
- **Header:** Back-Button (←) + Titel "Mitglied einladen"
- **QR-Code-Bereich:** Weisser Container mit abgerundeten Ecken, Platzhalter-Grafik (spaeter echten QR-Code generieren)
- **Link-Feld:** Read-only Input mit Copy-Button rechts (📋), klick kopiert in Clipboard
- **Hinweis:** Kleiner Text "Link gueltig fuer 7 Tage" in `--text-dim`
- **Buttons:** 3 Fullwidth-Buttons untereinander:
  - "Link teilen" — Primary-Style (teal), oeffnet native Share API
  - "Per WhatsApp" — Secondary-Style (surface), `whatsapp://send?text=...`
  - "Per E-Mail" — Secondary-Style (surface), `mailto:?subject=...&body=...`
- **Theme:** Dark/Light ueber `data-theme`, gleiche CSS-Variablen wie restliche App

---

## Variante 2: Wizard mit Rollen-Auswahl (Multi-Step)

**Konzept:** Zweistufiger Flow. Erst wird eine Rolle gewaehlt (damit z.B. Kinder nur ansehen/abhaken koennen), dann wird der Einladungslink generiert. Gibt mehr Kontrolle, ist aber ein Schritt mehr.

### Flow

```
Einstellungen / Liste
        │
        ▼
  [+ Mitglied einladen]
        │
        ▼
┌─────────────────────────┐
│ Step 1: Rolle waehlen   │
│ (Familienmitglied /     │
│  Mitbewohner / Gast)    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Step 2: Einladung teilen│
│ (Link / QR / WhatsApp)  │
└────────────┬────────────┘
             │
             ▼
   Empfaenger oeffnet Link
   → Rolle automatisch gesetzt
```

### Screen 1: Rolle waehlen

```
┌──────────────────────────────┐
│ ←  Mitglied einladen         │
│──────────────────────────────│
│                              │
│  Welche Rolle soll die       │
│  Person haben?               │
│                              │
│ ┌──────────────────────────┐ │
│ │ 👨‍👩‍👧  Familienmitglied     │ │
│ │ Alles sehen, bearbeiten  │ │
│ │ und Listen verwalten      │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🏠  Mitbewohner/in       │ │
│ │ Listen sehen, Items      │ │
│ │ hinzufuegen & abhaken    │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 👀  Gast                  │ │
│ │ Nur eine bestimmte Liste │ │
│ │ sehen und abhaken        │ │
│ └──────────────────────────┘ │
│                              │
│                              │
│                              │
│──────────────────────────────│
│ Step 1 von 2      [Weiter →]│
└──────────────────────────────┘
```

### Screen 2: Einladung teilen

```
┌──────────────────────────────┐
│ ←  Einladung teilen          │
│──────────────────────────────│
│                              │
│  Einladung als               │
│  "Familienmitglied"          │
│                              │
│      ┌────────────────┐      │
│      │                │      │
│      │   ██ QR ██     │      │
│      │   ██ CODE██    │      │
│      │                │      │
│      └────────────────┘      │
│                              │
│ ┌──────────────────────┬───┐ │
│ │ shopzebra.app/j/Bx2k │ 📋│ │
│ └──────────────────────┴───┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │    📤  Link teilen       │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │    💬  Per WhatsApp      │ │
│ └──────────────────────────┘ │
│                              │
│──────────────────────────────│
│ Step 2 von 2                 │
└──────────────────────────────┘
```

### Implementierungsdetails (HTML)

- **Layout:** Zwei "Screens" in einer HTML-Datei, Umschaltung per CSS-Klasse (`step-1` / `step-2` sichtbar)
- **Step-Indicator:** Footer-Zeile mit "Step X von 2" und Weiter-Button
- **Screen 1 — Rollenauswahl:**
  - 3 auswaehlbare Cards (Radio-Verhalten: nur eine aktiv)
  - Aktive Card: `--surface-selected` Border + leichter Glow
  - Jede Card: Icon links, Titel bold, Beschreibung in `--text-secondary`
  - "Weiter"-Button disabled solange keine Rolle gewaehlt
- **Screen 2 — Teilen:**
  - Gleich wie Variante 1, aber mit Rollen-Badge oben ("Einladung als Familienmitglied")
  - QR-Code, Link-Feld, Share-Buttons
- **Animation:** Slide-Transition horizontal zwischen Step 1 und Step 2 (`transform: translateX`)
- **Back-Button:** In Step 2 zurueck zu Step 1

---

## Variante 3: Bottom-Sheet mit Quick-Invite

**Konzept:** Kein eigener Screen, sondern ein Bottom-Sheet (Half-Modal), das ueber dem aktuellen Screen aufgeht. Kompakt, schnell, bleibt im Kontext. Ideal wenn man direkt aus einer Liste heraus einladen will.

### Flow

```
Listenansicht / Einstellungen
        │
        ▼
  [+ Einladen] oder [👥] Icon
        │
        ▼
┌─────────────────────────────┐
│ Bottom-Sheet faehrt hoch    │
│ (halber Bildschirm)         │
│                             │
│ Name eingeben (optional)    │
│ → Link generieren           │
│ → Direkt teilen             │
└────────────┬────────────────┘
             │
             ▼
   Sheet schliesst sich
   → Toast: "Einladung gesendet"
```

### Screen: Bottom-Sheet (ueber aktuellem Screen)

```
┌──────────────────────────────┐
│                              │
│  (Aktueller Screen           │
│   dahinter, abgedunkelt)     │
│                              │
│                              │
├──────────────────────────────┤  ← Drag-Handle
│ ──────                       │
│                              │
│  Mitglied einladen           │
│                              │
│ ┌──────────────────────────┐ │
│ │ Name (optional)          │ │
│ └──────────────────────────┘ │
│                              │
│  Teilen via:                 │
│                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ │
│  │  📤  │ │  💬  │ │  ✉️  │ │
│  │Share │ │WhatsA│ │E-Mail│ │
│  └──────┘ └──────┘ └──────┘ │
│                              │
│  Oder QR-Code zeigen:        │
│                              │
│ ┌──────────────────────────┐ │
│ │    QR-Code anzeigen  ▼   │ │
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘
```

### Screen: Bottom-Sheet (QR aufgeklappt, Full-Height)

```
┌──────────────────────────────┐
├──────────────────────────────┤  ← Drag-Handle
│ ──────                       │
│                              │
│  Mitglied einladen           │
│                              │
│ ┌──────────────────────────┐ │
│ │ Name (optional)          │ │
│ └──────────────────────────┘ │
│                              │
│  Teilen via:                 │
│                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ │
│  │  📤  │ │  💬  │ │  ✉️  │ │
│  │Share │ │WhatsA│ │E-Mail│ │
│  └──────┘ └──────┘ └──────┘ │
│                              │
│      ┌────────────────┐      │
│      │                │      │
│      │   ██ QR ██     │      │
│      │   ██ CODE██    │      │
│      │                │      │
│      └────────────────┘      │
│                              │
│ ┌──────────────────────┬───┐ │
│ │ shopzebra.app/j/Cx3m │ 📋│ │
│ └──────────────────────┴───┘ │
│                              │
│  Link gueltig fuer 7 Tage   │
│                              │
└──────────────────────────────┘
```

### Implementierungsdetails (HTML)

- **Overlay:** Dunkler Backdrop (`rgba(0,0,0,0.5)`) ueber dem aktuellen Screen, klick schliesst Sheet
- **Bottom-Sheet Container:**
  - Position: fixed, bottom: 0, border-radius oben 20px
  - Drag-Handle: Kleiner horizontaler Balken oben zentriert (rein dekorativ im HTML-Prototyp)
  - Zwei Zustaende: Half-Height (ca. 50vh) und Full-Height (ca. 90vh, wenn QR aufgeklappt)
  - Transition: `transform: translateY()` + `max-height` Animation
- **Name-Feld:** Optionales Text-Input, Placeholder "Name (optional)"
- **Share-Buttons:** 3 Icons in einer Reihe (Flexbox, gleichmaessig verteilt)
  - Jeweils: Runder Icon-Container + Label darunter
  - Share → native Share API
  - WhatsApp → Deep-Link
  - E-Mail → mailto-Link
- **QR-Bereich:** Standardmaessig eingeklappt, "QR-Code anzeigen" als Expand-Trigger
  - Beim Aufklappen: Sheet faehrt auf Full-Height, QR + Link-Feld werden sichtbar
  - CSS-Transition fuer smooth expand
- **Toast:** Nach "Teilen" erscheint kurz ein Toast am unteren Rand: "Einladung gesendet ✓" (auto-dismiss nach 3s)

---

## Vergleich

| Kriterium              | V1: QR + Link     | V2: Wizard + Rollen | V3: Bottom-Sheet     |
|------------------------|--------------------|----------------------|----------------------|
| Anzahl Screens         | 1                  | 2                    | 0 (Overlay)          |
| Schritte fuer User     | 1 Tap + Teilen     | 2 Taps + Teilen      | 1 Tap + Teilen       |
| Rollenverwaltung       | Nein               | Ja                   | Nein                 |
| Kontext bleibt sichtbar| Nein (eigene Page) | Nein (eigene Page)   | Ja (dahinter sichtbar)|
| Komplexitaet HTML      | Niedrig            | Mittel               | Mittel-Hoch          |
| Beste fuer             | MVP / Einfachheit  | Spaetere Version     | Native-App-Feeling   |

**Empfehlung fuer MVP:** Variante 1 (einfach, schnell, deckt den Kern-Usecase ab). Rollenverwaltung (V2) kann spaeter ergaenzt werden. Bottom-Sheet (V3) ist das beste UX-Feeling, erfordert aber mehr CSS-Arbeit.
