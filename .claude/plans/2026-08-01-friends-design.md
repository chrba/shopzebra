# Freundesliste — Design

**Status:** besprochen und abgenommen 2026-08-01. Baut auf
`2026-07-31-list-members-invite-link-design.md` auf und hebt die dortige
Entscheidung „kein Freundes-Konzept" auf.
Mockup: `apps/mobile/design/pure/proposals/friends-concept.html`.

## Zweck

Die Freundesliste hat **genau eine Aufgabe**: das nächste Teilen zu einem Tap
machen. Sie ist ein Adressbuch, kein soziales Netz — kein Profil, kein Status,
keine Nachrichten. Alle Regeln unten folgen aus dieser einen Festlegung.

Sie heißt „Freunde" und nicht „Familie" oder „Gruppe", weil es nichts
anzulegen, umzubenennen oder zu verlassen gibt. Ein Gruppenname würde
Verwaltung versprechen, die es nicht gibt.

## Regeln

| Vorgang | Wirkung |
|---|---|
| Jemand nimmt eine **Listen**-Einladung an | beide landen im Adressbuch des anderen |
| Jemand nimmt eine **Freundschafts**-Einladung an | beide landen im Adressbuch des anderen |
| Freund **entfernen** | nur die eigene Seite; der andere merkt nichts |
| Freund entfernen | **ändert keine Listen-Mitgliedschaft** |
| Von einer Liste entfernt werden | ändert am Adressbuch nichts |

Die Kopplung ist damit **einseitig**: *Die Freundesliste sammelt, sie streicht
nie.* Hinzufügen passiert automatisch, Entfernen immer von Hand und nur im
Adressbuch.

**Warum Entfernen persönlich und nicht symmetrisch:** Ein Adressbuch ist
persönlich. Räumt Tom bei sich auf, darf sich Sarahs Liste nicht ändern — sie
hätte nichts getan und bekäme es nicht erklärt. Das Gegenargument (Tom bleibt
für Sarah antippbar und landet wieder auf Listen) trägt nicht: Auf eine Liste
gesetzt zu werden ist sichtbar, und jedes Mitglied kann sich selbst entfernen.

**Warum kein Block-Marker:** Das automatische Anlegen passiert **beim
Beitritt**, nicht laufend. Ein entfernter Freund bleibt entfernt; eine
bestehende gemeinsame Liste holt ihn nicht zurück. Tritt er später einer
*weiteren* Liste bei, ist er wieder da — bewusst so, ihr teilt ja erneut.

**Warum nicht rein abgeleitet** (Freunde = wer eine Liste mit mir teilt):
Dann gäbe es weder ein Entfernen, das hält, noch eine Einladung ohne Liste.
Beides ist ausdrücklich gewünscht, also werden Freundschaften gespeichert.

## Obergrenze

**Sechs Mitglieder pro Liste**, den Owner eingerechnet — zwei Eltern plus vier
Kinder gehen auf. Es werden also fünf eingeladen.

- Durchgesetzt wird **serverseitig an beiden Eintrittspunkten**: `join_list`
  (Invite-Link einlösen) und `add_member` (Freund direkt hinzufügen). Nur im
  Frontend zu prüfen wäre wirkungslos, die Endpunkte sind offen.
- Die **UI zeigt es vorher**: voller Einladen-Kreis stumpf, Freunde auf dem
  Teilen-Screen nicht antippbar, Hinweis „Liste ist voll (6 von 6)".

- Der **Fehlerfall bleibt nötig**: Zwei können gleichzeitig den letzten Platz
  einlösen. Der Verlierer bekommt eine klare Meldung, keinen stillen Fehlschlag.
  **Bekannte Grenze (Review 2026-08-01):** Der Cap-Check ist read-then-write
  ohne Conditional Write. Lösen zwei Aufrufer den letzten Platz im selben
  Augenblick ein, bekommen beide 200 und die Liste hat sieben Mitglieder —
  ärgerlich, aber nicht korrupt. Der saubere Fix (Zähler-Item mit Conditional
  Write bzw. Transaktion über Count+Put) ist bewusst vertagt; er ist jederzeit
  nachrüstbar, ohne Schnittstellen zu ändern.
- **Befreunden beim Beitritt ist best-effort** (Review 2026-08-01): Die
  Freundschafts-Puts laufen nach dem Membership-Commit und schlucken Fehler —
  ein gelungener Beitritt gibt nie 500. Im seltenen Fehlerfall fehlt eine
  Freundschaft still; heilbar über den Freundschafts-Link. Die Alternative
  (Fehler propagieren) wäre unheilbar: Der Retry liefe in den
  Already-Member-Frühausstieg und das Befreunden fände nie mehr statt.
- Die **Freundesliste selbst ist unbegrenzt** — ein Adressbuch gibt niemandem
  Zugriff auf Daten.

### Eine einzige Stelle zum Ändern

Die Zahl steht **genau einmal im Code**, in `services/domain/src/limits.rs`:

```rust
//! Produkt-Limits. Wer eine Zahl ändern will, ändert sie hier — nirgends
//! sonst steht sie im Code.

/// Mitglieder pro Liste, den Owner eingerechnet.
pub const MAX_LIST_MEMBERS: usize = 6;
```

Beide Use Cases lesen die Konstante; kein Literal `6` irgendwo sonst, auch
nicht in Tests — die rechnen mit `MAX_LIST_MEMBERS`, damit eine Änderung nicht
zwanzig Testerwartungen bricht.

**Das Frontend bekommt die Zahl vom Server**, es hält keine eigene Kopie.
`GET /lists` liefert sie additiv mit (`maxMembers`, neben `lists` und
`ownerNames`), die UI rendert „6 von 6" daraus. Sonst gäbe es zwei Orte mit
derselben Zahl und genau das Suchen, das vermieden werden soll.

Wenn die Zahl später **ohne Deploy** änderbar sein soll, wird aus der Konstante
ein Default und der Wert kommt als Lambda-Environment aus dem CDK-Stack. Dann
liegt sie ebenfalls an einer Stelle, nur eben in `ShopZebraApiStack.ts`. Heute
nicht nötig — die Konstante reicht und kann nicht falsch konfiguriert sein.

## Backend

**Kein Event-Log.** Freundschaften sind eine Projektion wie die Membership:
user-scoped, konfliktfrei, niemand faltet sie. Damit bleiben Envelope-
Allowlist, `AggregateKind`, `partition_key`, die Sync-Engine und alle
bestehenden Tests unberührt. Kein neues Aggregat, keine neue Tabelle.

Zeilen in der **bestehenden Membership-Tabelle**:

```
pk = "USER#<a>"           sk = "FRIEND#<b>"    eine Zeile pro Richtung,
pk = "USER#<b>"           sk = "FRIEND#<a>"      unabhängig voneinander
pk = "FRIENDTOKEN#<tok>"  sk = "TOKEN"         Attr invitedBy, expiresAt
```

Zwei Richtungen, damit „meine Freunde" ein einziger Query ist
(`pk = USER#<ich>`, `begins_with(sk, "FRIEND#")`) — kein GSI, kein Scan. Weil
das Entfernen persönlich ist, sind die beiden Zeilen unabhängig: Annehmen
schreibt beide, Entfernen löscht nur die eigene.

⚠️ **Keine dieser Zeilen darf ein Attribut `userId` tragen.** Der `byUser`-GSI
indiziert genau dieses Attribut, und DynamoDB nimmt nur Items auf, die es
besitzen. Stünde es drauf, tauchten Freundschaften in `aggregates_of()` auf —
der Abfrage, die bestimmt, welche Listen ein Gerät synchronisiert. Deshalb
heißt das Token-Attribut `invitedBy`, wie der OWNER-Marker `claimedBy` heißt.

**Ports:** `FriendStore` (`friends_of`, `add_friendship`, `remove_friendship`)
und `FriendInviteStore` (`put_token`, `token_by_value`). Getrennt vom
vorhandenen `InviteStore`, dessen `StoredInvite` eine `AggregateId` trägt — ein
Freundes-Token hat keine, und den Typ aufzubohren würde bestehende Tests brechen.

**Endpunkte:**

```
POST   /friends/invites      Token erzeugen (jeder Angemeldete, 7 Tage)
POST   /friends/join         einlösen, schreibt beide Richtungen
GET    /friends              Freunde mit Namen (über UserDirectory)
DELETE /friends/{friendId}   nur die eigene Richtung löschen
```

**Änderung am Bestand:** `add_member` prüft heute „teilt schon eine Liste".
Richtig ist künftig „ist mein Freund".

`join_list` und `add_member` legen zusätzlich Freundschaften zwischen dem Neuen
und allen bestehenden Mitgliedern an — eine Schreiboperation pro Mitglied, bei
Haushaltsgröße irrelevant.

## Frontend

Freunde kommen per `GET` beim Öffnen des Screens, nicht über den Sync — sie
liegen nicht im Log. Die Antwort wird lokal gecacht, damit der Screen offline
den letzten Stand zeigt.

Screens laut Mockup:

1. **Freunde** — Avatar und Name, Entfernen per Wisch nach rechts (Geste wie in
   der Listen-Übersicht), unten die Karte „Neuen Freund einladen"
2. **Liste teilen** — „Auf dieser Liste" mit Häkchen, darunter „Deine Freunde"
   zum Antippen; ein Tap fügt sofort hinzu
3. **Einladen** — QR, Link, WhatsApp, E-Mail. Derselbe Screen trägt beide Fälle;
   der Link entscheidet, was beim Annehmen passiert
4. **Einladung annehmen** — was der Eingeladene sieht: Avatar, „X möchte dich
   hinzufügen", Annehmen und Ablehnen
5. **Kompakte Avatar-Reihen** — höchstens vier Kreise, dann eine „+N"-Pille; auf
   der Kachel drei überlappende Kreise plus Zahl. Vorschau und Einstieg, kein
   Verwaltungsort

Einstieg in die Freunde: der Chip „Mitglieder" in der Listen-Übersicht, heute
noch reiner Text ohne Handler.

## Nicht im Umfang

- Kein Gruppen- oder Familien-Konzept
- Keine Suche im Freunde-Screen (bei erwartbarer Größe unnötig)
- Kein Premium-Modell; die Sechser-Grenze ist ein Produkt-Limit, kein Paywall-Hebel
