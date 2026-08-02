# Teilen — das Modell

**Entschieden 2026-08-02.** Gilt für Einkaufslisten, Rezepte und Wochenpläne.
Ersetzt die Überlegungen zu Haushalten, Familien-Gruppen und Rezept-Kopien, die
im Vorfeld verworfen wurden (siehe [Verworfene Alternativen](#verworfene-alternativen)).

## Die Regel

> **Liste, Rezept und Wochenplan werden exakt gleich geteilt.**
>
> Jedes dieser Dinge hat einen Besitzer — den Ersteller. Er teilt es, per
> Einladungslink oder mit einem Tap aus seiner Freundesliste. Wer dabei ist,
> **sieht und ändert**. Ungeteilte Dinge gehören nur dem Besitzer.

Es gibt keine Gruppe, keinen Haushalt, keine Voreinstellung, keine Kopien und
keinen Nur-Lesen-Modus. Ein Nutzer lernt das Teilen **einmal** und kann es
überall.

## Die Freundesliste

Das Adressbuch. Es gibt **für sich genommen keinen Zugriff** auf irgendetwas —
es sorgt nur dafür, dass Teilen ein Tap ist statt ein Link.

- Wächst automatisch: Wer eine Einladung annimmt, landet beidseitig im
  Adressbuch
- Entfernen ist persönlich und ändert **keine** Mitgliedschaften
- Unbegrenzt — ein Adressbuch gibt niemandem Zugriff auf Daten

Details: [`.claude/plans/2026-08-01-friends-design.md`](../.claude/plans/2026-08-01-friends-design.md)

## Was für alle drei gilt

| | |
|---|---|
| Besitzer | der Ersteller |
| Einladen | nur der Besitzer, per Link oder Freundes-Tap |
| Rechte der Mitglieder | sehen und ändern, kein Nur-Lesen |
| Entfernen | Besitzer entfernt jeden; jeder entfernt sich selbst |
| Obergrenze | `MAX_LIST_MEMBERS` aus `services/domain/src/limits.rs` |
| Beitritt | erzeugt beidseitig einen Eintrag im Adressbuch |

Damit sind Rezepte und Pläne **nicht mehr user-scoped**. Die Notiz in
`domain-model.md` („Wochenplan user-scoped, Teilen offen") ist überholt.

## Warum so

**Weil die Einfachheit die härteste Anforderung ist.** Wenn die Erklärung, wer
was sieht, mehr als einen Satz braucht, ist das Konzept falsch — egal wie
elegant es auf dem Papier aussieht. Ein Modell, das jeden Sonderfall abdeckt
aber ein Handbuch braucht, verliert gegen ein einfacheres, das die realen Fälle
abdeckt.

**Weil ein Mechanismus weniger Fehler hat als drei.** Jede Sonderregel ist eine
Stelle, an der Nutzer etwas anderes erwarten als die App tut — und eine Stelle,
an der Autorisierung schiefgehen kann.

**Weil das Teilen längst gebaut ist.** Einladungstoken, Beitritt,
Mitgliederverwaltung, Obergrenze, Entfernen hängen an `AggregateId`, und
`AggregateKind` kennt `Recipe` und `Plan` bereits. Rezepte und Pläne verdrahten
dieselben Bausteine, statt neue zu erfinden. Kein neues Aggregat, keine neue
Tabelle, keine Änderung an der Sync-Engine.

## Der Preis, bewusst bezahlt

**Jedes Ding muss einzeln geteilt werden.** Ohne stehende Gruppe sieht ein neues
Rezept zunächst niemand, und ein neuer Wochenplan muss wieder geteilt werden.
Bei vier Personen sind das ein paar Taps pro neuem Ding.

Abgefedert wird das in der Oberfläche, **nicht im Modell**: Beim Teilen sind die
Personen vorausgewählt, mit denen zuletzt geteilt wurde. Sichtbare Häkchen, die
man abwählen kann — reine Bequemlichkeit, keine zweite Regel.

## Verworfene Alternativen

**Haushalt als stehende Gruppe** (Kochbuch und Pläne gehören dem Haushalt,
Listen wahlweise). Deckt alle Fälle ab und spart Taps, führt aber zwei
Zugriffswege ein: Gruppe *oder* Einzelperson. Die Erklärung braucht dann mehrere
Sätze, und bei jedem Anlegen stellt sich die Frage „für wen?". Verworfen wegen
Komplexität, nicht wegen Untauglichkeit — nachrüstbar, falls die Taps in der
Praxis stören.

**Rezepte als Kopie weitergeben** (Empfänger bekommt ein eigenes, unabhängiges
Rezept). Passt zur Intuition „Rezeptkarte weiterreichen" und schützt eigene
Anpassungen. Verworfen, weil es einen **zweiten** Mechanismus neben dem Teilen
einführt: Nutzer müssten verstehen, dass Listen live geteilt und Rezepte kopiert
werden. Ein geteiltes Rezept darf stattdessen jeder ändern, genau wie eine
Liste.

**Öffentliche Rezepte** (jeder mit Link sieht sie, Autor kann korrigieren).
Nicht verworfen, sondern **vertagt** — es bräuchte den ersten
unauthentifizierten Endpunkt der App und wäre eine lebende Autorenseite statt
einer Mitgliedschaft. Eigener Schritt, wenn er kommt.

**Mehrere Haushalte pro Person.** Mit dem Haushalt zusammen entfallen.

## Folgen für die Umsetzung

1. **Rezepte vor Wochenplan.** Eine Mahlzeit im Plan *ist* ein Rezept
   (`design/pure/recipe-workflow/planning.html`: „Rezept hinzufügen" öffnet
   einen Picker über die Sammlung). Ohne Rezepte ist der Plan ein leerer
   Kalender.
2. **Je Aggregat dieselben Endpunkte** wie für Listen: Erstellen als Klasse-2-
   Command, Invite, Join, Member hinzufügen, Member entfernen.
3. **Der Catch-up-Fan-out** muss Rezepte und Pläne mitziehen — heute liefert
   `GET /lists` nur Listen.
4. **Frontend-Wiederverwendung:** Members-Screen, Invite-Screen, Freunde-Picker
   und die Voll-Zustände sind bereits generisch genug, um mit einem anderen
   Aggregat-Typ zu arbeiten.
