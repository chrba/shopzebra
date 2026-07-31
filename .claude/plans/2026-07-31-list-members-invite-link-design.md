# Listen-Mitglieder & Invite-Link — Design

**Status:** abgenommen 2026-07-31. Ersetzt die offenen Punkte und die „bewusst akzeptierten Grenzen" in
`2026-07-31-list-members-invite-link.md`; der Implementierungsplan wird entsprechend nachgezogen.

## Ziel

Ein Listen-Owner lädt Mitglieder per Link ein. Der Eingeladene tritt bei, sieht die Liste, und beide
sehen einander mit echtem Namen. Der Flow funktioniert vollständig — nicht als Vorbereitung mit
Platzhaltern.

## Zielbild des Invite-Flows

Wie bei Bring!: geteilte Listen setzen auf **beiden** Seiten ein Konto voraus. Der Unterschied zum
Ist-Zustand ist nicht die Kontopflicht, sondern dass der Link sie überlebt.

```
A: Members-Page → Einladen-Tab → Link kopieren / WhatsApp / E-Mail
B: öffnet /join/tok-abc

  ohne Session                          mit Session
  └─ joinIntentStored({ token })        └─ Loader löst direkt ein
     → /signin  (ohne Parameter)
        … Sign-up: Name, E-Mail, Passwort
        … Bestätigungscode aus der Mail
        … autoSignIn
           └─ eine Stelle entscheidet:
              pending Intent? → /join/tok-abc : /lists
                 └─ Loader: joinListByToken → Intent löschen
                    → requestSync → /lists/<listId>
```

## Entscheidungen

### 1. Join-Absicht ist persistierter State, kein URL-Parameter

Die naheliegende Lösung — `?redirect=/join/tok` durch die Auth-Kette reichen — wurde verworfen. Sie
verteilt die Verantwortung auf vier Sprünge (`requireAuth`, „Konto erstellen"-Link, `SignUpPage` nach
Bestätigung, `SignInPage` nach Login); vergisst einer das Durchreichen, bricht der Flow still. Sie
zwingt die Auth-Seiten außerdem, etwas über Listen zu wissen, und sie überlebt keinen App-Kill —
während B in der Mail-App den Bestätigungscode holt, genau der Normalfall.

Stattdessen: `/join/$token` legt bei fehlender Session eine **Join-Intent** im Store ab und leitet
parameterlos auf `/signin`. Nach erfolgreicher Authentifizierung fragt **eine** Stelle den Selektor
und navigiert entweder auf die Intent oder auf `/lists`.

Eigenschaften:

- Eine Weiterreiche-Stelle statt vier; die Auth-Seiten bleiben ohne Listen-Wissen.
- Überlebt App-Kill und Neustart, weil persistiert.
- Kein Open-Redirect: es gibt keine nutzerkontrollierte Ziel-URL, die validiert werden müsste.
- Trägt später App Links (`events.md:337`) — der Deep Link ist dann nur ein weiterer Weg, dieselbe
  Intent zu setzen.

Ablage: normales Feld im Redux-State, Persistenz über den bestehenden Handler-Mechanismus. Ein Token
ist Kleinkram, also `@capacitor/preferences` wie `deviceId`, nicht das Filesystem (CLAUDE.md-Trennung).
Die Intent wird beim Einlösen gelöscht und beim Sign-out mitgepurgt.

### 2. Namen entstehen bei der Registrierung

Heute hat **kein** Nutzer einen Namen: `signUp({ username, password })` setzt keine User-Attribute
(`authThunks.ts:101`), und `handleSaveName` schließt nur das Eingabefeld, ohne zu speichern
(`ProfilePage.tsx:118`). `fetchCurrentAuthUser` liest den Claim `name` mit Fallback `''`
(`authThunks.ts:51`). Der `UserDirectory`-Port lieferte damit für jeden `None`, und die Members-Page
zeigte durchgehend den Fallback.

Deshalb:

- **Namensfeld im Sign-up-Formular**, erstes Feld vor E-Mail. Der Name geht als `userAttributes.name`
  in denselben `signUp`-Aufruf — ein Request, kein Zeitfenster ohne Namen, keine Verzweigung für
  Google-Nutzer (dort kommt der Name aus dem Profil). Ein nachgelagerter Namensschritt bräuchte nach
  Bestätigung und Login einen zweiten Schreibpfad.
- **`handleSaveName` speichert wirklich**, per `updateUserAttributes`.
- **`autoSignIn`**, damit B sich nicht direkt nach dem Vergeben des Passworts erneut anmelden muss.

Für die Registrier-Seite existiert kein Mockup — `login.html` mockt nur den Login, „Konto erstellen"
wirft dort einen Toast (`login.html:506`, `:593`). Das Namensfeld ist deshalb keine Design-Abweichung.

Google-Login: Der Name kommt aus dem Google-Profil, sofern im User Pool das Attribute-Mapping
`name → name` gesetzt ist. Der Pool wird vorerst nur als feste ID referenziert
(`ShopZebraApiStack.ts:10`) und später nach CDK geholt — bis dahin ist das Mapping Konsolen-Zustand
und nicht im Repo prüfbar.

### 3. Der Owner-Name reist über `GET /lists`

Namen reisen laut `events.md:81` in `listMemberAdded` — das der Owner für sich selbst nie auslöst.
`listCreated { listId, name, ownerId }` trägt den Namen der *Liste*, nicht den des Owners. Auf seinem
eigenen Gerät fällt das nicht auf („Admin · Du"), Beigetretene sähen einen Platzhalter, obwohl
`invite.html` dort einen Namen zeigt.

Die Listen-Projektion reichert den Owner-Namen über dasselbe `UserDirectory` an. Kein neues Event,
keine Änderung an Envelope-Allowlist oder JSON-Schema, keine bestehenden Tests betroffen. Die
Alternative — `ownerName` in `listCreated` — wäre architektonisch sauberer (der Name reist im Event),
berührt aber die Allowlist und damit möglicherweise bestehende Tests; laut Test-Policy wäre dafür eine
eigene Entscheidung nötig.

### 4. Entfernen funktioniert

`DELETE /lists/{listId}/members/{memberId}` als dritte Lambda, `listMemberRemoved` als Klasse-2-Event
(steht bereits in `events.md:83` und `:333`), `check_can_remove` existiert bereits in `membership.rs`.
Der Fold kommt in den lists-Slice. Damit deckt sich das Verhalten mit `executeRemove()` in der Vorlage
und mit `job-stories.md` („remove them with one tap"). Der Toast „Entfernen kommt bald" aus dem
ursprünglichen Plan entfällt.

Berechtigung laut `events.md:37`: der Owner entfernt jeden, jedes Mitglied kann sich selbst entfernen.

### 5. Einstiegspunkt

Der Summary-Chip „n Mitglieder" im Header der Listen-Übersicht (`lists.html:469`:
`<a class="summary-chip" href="invite.html">`). Der ursprüngliche Plan sah eine Zeile in der
`EditListPage` vor — die steht in keiner Vorlage und entfällt.

### 6. Unverändert übernommen

- **Invites nur vom Owner** (`events.md:37`), daher ist der Einladen-Tab für Nicht-Owner ausgeblendet.
  Das Mockup kennt keine Rollen; die Abweichung erzwingt das Owner-Modell.
- **Token:** UUID v4 simple, 7 Tage gültig, ein aktiver Token pro Liste mit Reuse bei erneutem POST.
  Widerruf bleibt offen. `events.md:337` wird nachgezogen.
- **QR-Code bleibt die Attrappe** aus dem Mockup. Der Link steht daneben, der Flow hängt nicht daran.

## Komponenten

**Backend** (`services/`, hexagonal nach `architecture/backend-structure.md`)

| Einheit | Zweck |
|---|---|
| `domain/ports.rs` | `InviteStore` (Token ablegen/auflösen), `UserDirectory` (Anzeigename) |
| `domain/usecases/create_invite.rs` | Owner-only, Reuse des aktiven Tokens |
| `domain/usecases/join_list.rs` | Token prüfen, Namen anreichern, `listMemberAdded` schreiben, Membership setzen |
| `domain/usecases/remove_member.rs` | `check_can_remove`, `listMemberRemoved` schreiben, Membership entziehen |
| `adapters/dynamodb_invites.rs` | Beide Lookups auf der Membership-Tabelle |
| `adapters/cognito_user_directory.rs` | `ListUsers` mit `sub`-Filter |
| `lambdas/{create-invite,join-list,remove-member}` | je ein Binary, kein Routing |

Die neuen Ports werden als **separate Use-Case-Parameter** gereicht; die `Ports`-Struct und damit alle
bestehenden Lambdas und Tests bleiben unangetastet.

**Frontend** (`apps/mobile/src/features/`)

| Einheit | Zweck |
|---|---|
| `lists/domain/listsSlice.ts` | Folds für `listMemberAdded` / `listMemberRemoved`, Selektor `selectListMembers` |
| `lists/join/joinIntentSlice.ts` | Join-Intent: setzen, löschen, Selektor; Persistenz-Handler |
| `lists/join/JoinListPage.tsx` | Route `/join/$token` mit Loader |
| `lists/members/MembersPage.tsx` | Route `/lists/$listId/members` nach `invite.html` |
| `lists/members/inviteCommands.ts` | `fetchListInvite`, `joinListByToken`, `removeMember` |
| `auth/*` | Namensfeld im Sign-up, `handleSaveName` speichert, `autoSignIn`, Post-Auth-Navigation |

Die drei Frontend-Commands sind die dokumentierte Direct-Fetch-Ausnahme: die Server-Antwort wird
gebraucht, **bevor** etwas angezeigt oder dispatcht werden kann. Sie laufen nicht über die Outbox.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Token unbekannt oder abgelaufen | 400; `JoinListPage` zeigt „Einladungslink ungültig oder abgelaufen" + Weg zu `/lists` |
| Bereits Mitglied | 200, kein zweites Event; B landet in der Liste |
| Nicht-Owner ruft Invite ab | 403; Einladen-Tab ist für ihn ohnehin ausgeblendet |
| Nicht-Owner entfernt fremdes Mitglied | 403 |
| Intent zeigt auf gelöschte oder fremde Liste | Intent wird beim Fehlschlag gelöscht, sonst klebt sie am nächsten Login |
| Kein Name gesetzt (Konten von vor dieser Änderung) | Fallback auf der Karte, bis der Name im Profil nachgetragen wird. Ab dieser Änderung registrierte Konten haben immer einen. |

## Tests

Bestehende Tests bleiben unangetastet (User-Policy). Neue Tests in neuen Dateien bzw. neuen
`#[cfg(test)]`-Funktionen.

- **Domain (Rust):** Ablauf und Reuse des Tokens, Owner-only, Join idempotent, unbekanntes/abgelaufenes
  Token, Entfernen durch Owner und durch sich selbst, Entfernen durch Fremde abgelehnt.
- **Adapters (Rust):** Item-Mapping-Helfer, wie bei `dynamodb_membership.rs`.
- **Slice (Vitest):** Fold von `listMemberAdded` / `listMemberRemoved` inklusive Totalität (doppeltes
  Event, unbekannte Liste), `selectListMembers`.
- **Join-Intent (Vitest):** Setzen, Einlösen, Löschen beim Sign-out.
- **Commands (Vitest):** Pfade, Bodys und Fehler-Statuscodes gegen einen Fake-Fetcher.
- **Infra:** `pnpm test` und `pnpm cdk synth --quiet` — cargo-lambda bundelt den Workspace beim Synth.

## Nicht im Umfang

- Native Deep Links (App Links / AASA) — der Link funktioniert im Browser/WebView derselben Origin.
- Widerruf von Invite-Tokens.
- Der User Pool bleibt vorerst außerhalb von CDK.
- Echter QR-Code.
