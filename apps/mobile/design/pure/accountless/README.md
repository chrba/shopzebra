# Ohne Konto starten — Click-Dummy

Die **gewählten** Varianten aus
[`../proposals/accountless-screens.html`](../proposals/accountless-screens.html)
(dort stehen weiterhin alle Vorschläge zum Vergleich). Entscheidung vom
2026-08-02, Begründung in
[`architecture/accountless-first-planned.md`](../../../../../architecture/accountless-first-planned.md).

| Screen | Datei | Variante |
|---|---|---|
| Name beim ersten Teilen | `share-name.html` | **1A** Bottom Sheet über der Liste |
| Profil im Gast-Zustand | `../profile.html` (Konto-Sektion) | **2A** dezente Zeile |
| Daten sichern | `secure-data.html` | **3B** Social zuerst, E-Mail als Nachsatz |
| E-Mail: Adresse | `email-address.html` | wie vorgeschlagen |
| E-Mail: Code | `email-code.html` | wie vorgeschlagen |
| E-Mail: Geschafft | `email-done.html` | wie vorgeschlagen |
| Adresse schon vergeben | `email-exists.html` | **5B** eigener Zwischen-Screen |
| Anmelden + Zusammenführen | `sign-in-merge.html` | **6A** Sheet mit Zahl |

## Wege durch den Dummy

**Erstes Teilen** — `../lists.html` → Chip „Mitglieder" → `share-name.html` →
`../invite.html`

**Konto verknüpfen** — `../profile.html` → „Daten sichern" → `secure-data.html`
→ Google/Apple → `email-done.html`, oder „Lieber mit E-Mail" →
`email-address.html` → `email-code.html` → `email-done.html`

**Adresse gehört schon jemandem** — `email-address.html` → Dummy-Pfad-Link →
`email-exists.html` → `sign-in-merge.html` → `../lists.html`

Der Dummy-Pfad-Link auf `email-address.html` existiert nur, weil es hier keinen
Server gibt, der die Adresse prüft. In der App entscheidet ein Command per
`ListUsers`, ob der Konflikt-Screen kommt.

## Warum es diesen Konflikt-Screen überhaupt gibt

Der Spike hat gezeigt: Cognito lehnt eine bereits vergebene E-Mail **nicht** ab.
`verifyUserAttribute` läuft durch und hängt den Alias still auf den neuen Nutzer
um — der Erstbesitzer verliert damit seinen E-Mail-Login. Die App muss den
Konflikt deshalb selbst erkennen. Details:
[`spikes/cognito-shadow-account/findings.md`](../../../../../spikes/cognito-shadow-account/findings.md).

## Technisch nicht abgebildet

Der Dummy zeigt nur Oberfläche. Nicht sichtbar, aber Teil der Entscheidung:
Bis zum ersten Teilen gibt es **keinen Server-Kontakt und kein Konto**; danach
synct **alles** (binäre Regel). Das Verknüpfen wertet dasselbe Konto auf — die
`sub` bleibt gleich, es wird nichts migriert.
