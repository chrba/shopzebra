# Ohne Konto starten — Richtung entschieden, Spike offen

> ⚠️ **Das ist Zukunft, kein Ist-Zustand.** Heute erzwingt die App ein
> Cognito-Konto vor allem anderen. Die **Richtung ist entschieden**
> (2026-08-02, siehe unten), aber vor der Umsetzung steht ein Spike, der die
> Cognito-Annahmen verifiziert.

## Die Absicht

**Wer die App öffnet, soll sofort loslegen können — ohne Konto, ohne
Registrierung, ohne E-Mail.** Liste anlegen, Sachen eintragen, einkaufen.

**Auch das Teilen soll ohne Konto funktionieren.** Zwei Leute mit frisch
installierter App sollen eine Liste gemeinsam führen können, ohne dass sich
einer von beiden registriert.

**Später soll man das Ganze mit einem Konto verknüpfen können** — alles, was
ohne Konto entstanden ist, wandert dabei mit und geht nicht verloren.

Das geht nur in der nativen App, nicht im Browser. Das ist in Ordnung: ShopZebra
ist laut CLAUDE.md eine native mobile App, der Browser ist nur der
Entwicklungsweg.

## Warum das erwähnenswert ist, bevor es geplant ist

Der Registrierungszwang ist die größte Hürde vor dem ersten Nutzen. Eine
Einkaufslisten-App muss man in dreißig Sekunden ausprobieren können. Wer erst
eine E-Mail bestätigen soll, probiert nicht aus.

## Woran man heute schon denken kann

Ohne dass jetzt etwas gebaut wird — diese Punkte sind billig zu beachten und
teuer nachzurüsten:

- **Identität ist nicht gleich Cognito-`sub`.** Überall, wo heute ein
  Cognito-Subject als Nutzer-Identität durchgereicht wird (`UserId` im Backend,
  `state.auth.user.userId` im Frontend), sollte niemand annehmen, dass dahinter
  zwingend ein registriertes Konto steht. Je weniger Code diese Annahme trifft,
  desto billiger wird die Umstellung.
- **Anzeigenamen kommen heute aus dem User Pool** (`CognitoUserDirectory`). Ohne
  Konto gibt es dort niemanden. Der Port ist die richtige Naht — eine zweite
  Implementierung kann Namen später anders auflösen, ohne dass Use Cases sich
  ändern.
- **Migration heißt Umschreiben von Besitz und Mitgliedschaft.** Alles, was an
  einer Identität hängt — Listen, Rezepte, Pläne, Freundschaften — muss beim
  Verknüpfen auf die neue Identität zeigen. Wer neue Daten an eine Identität
  bindet, sollte im Kopf haben, dass diese Bindung eines Tages umgezogen wird.
- **Der Sync braucht trotzdem eine Autorisierung.** Ohne Konto gibt es kein JWT
  vom User Pool. Womit sich ein kontenloses Gerät gegenüber der API ausweist,
  ist die zentrale offene Frage.

## Entschieden (2026-08-02)

Ergebnis des Brainstormings — Anforderungen und Richtung:

**Anforderungen (Produktentscheidungen):**

- **Gast ist dauerhaft vollwertig** — kein Probierzustand, kein Zwangs-Nudge
  zur Registrierung. Ein Konto ist rein optional
- **Geräteverlust ohne Konto = Daten weg**, akzeptiertes Risiko. Konto ist der
  Absicherungsweg (Keychain-Reinstall-Überleben ist Bonus, keine Garantie)
- **Anzeigename wird erst beim ersten Teilen erfragt** — solo völlig anonym
- **Login in ein bestehendes Konto merged automatisch** (Gast-Aggregate wandern
  additiv ins Konto — strukturell wie ein Sync von einem externen Nutzer).
  Bestätigungshinweis **vor** dem Merge ([Weiter]/[Abbrechen]), aber kein
  „lokal oder remote?"-Entscheidungsdialog
- **Verknüpfen mit E-Mail/Passwort, Google und Apple** (Apple ist bei Social
  Login auf iOS ohnehin Pflicht)
- **Kein Multi-Gerät als Gast** — wer zwei Geräte will, verknüpft ein Konto

**Richtung: Schattenkonto (statt Identity-Pool-Guest, Eigenbau-Auth oder
Firebase-Wechsel):**

- Beim ersten Server-Bedarf legt die App still einen normalen Cognito-User an
  (Username = UUID, Zufallspasswort, ohne E-Mail), Credentials im
  Keychain/Keystore. JWT, Authorizer, `sub`, Backend: alles unverändert
- **Verknüpfen = denselben User aufwerten**, nie migrieren: E-Mail als Alias
  nachrüsten (`updateUserAttributes` + Verifikation) bzw. Google/Apple per
  `AdminLinkProviderForUser` über einen kleinen Command-Endpunkt. Gleiche `sub`
- Braucht einen **neuen User Pool** (Pflicht- und Alias-Attribute sind nach
  Pool-Erstellung unveränderlich; der heutige Pool erzwingt E-Mail) — der neue
  Pool kommt dafür endlich in CDK
- Alle Bausteine sind einzeln offiziell dokumentiert; das Gesamtmuster ist
  kein AWS-Blueprint (Vorbild: Firebase Anonymous Auth). Bekannte heikle
  Stellen: Provider-Linking muss vor dem ersten direkten Federated-Login
  passieren; `AliasExistsException`, wenn die E-Mail schon einem Konto gehört

**Lokal bleiben, bis geteilt wird — mit binärer Sync-Regel:**

- Ohne Identität gibt es **keinen Server-Kontakt und kein Konto** — Events
  sammeln sich in der Outbox-Queue (sie ist bereits das lokale Event-Log)
- Erstes Teilen oder Verknüpfen: Name erfragen, Schattenkonto anlegen, Queue
  drainen, Invite erzeugen — ein Moment, der ohnehin Netz braucht
- **Binäre Regel:** Sobald eine Identität existiert, synct **alles** — auch
  ungeteilte Listen. Kein Pro-Aggregat-Modus in der Sync-Engine

## Vorgehen — zwei Aufgaben, in dieser Reihenfolge

1. **Spike:** Gegen einen Test-Pool verifizieren, dass Cognito das wirklich
   kann — Silent-SignUp ohne E-Mail → Login → E-Mail als Alias nachrüsten →
   Login per E-Mail → Google/Apple linken (`AdminLinkProviderForUser`) →
   Login per Google landet auf derselben `sub`. Erst wenn das steht, wird
   entworfen und gebaut
2. **Umsetzung** von „ohne Konto starten" auf Basis der Spike-Erkenntnisse

## Spike-Ergebnis (2026-08-02)

Durchgeführt gegen einen Wegwerf-Pool, Details und Skripte in
[`spikes/cognito-shadow-account/findings.md`](../spikes/cognito-shadow-account/findings.md).

**Der Ansatz trägt:** SignUp ohne E-Mail funktioniert (der User trägt nur `sub`),
Login mit UUID-Username liefert normale JWTs, und die nachgerüstete E-Mail führt
per Alias-Login auf **dieselbe `sub`** — die Identität ist stabil, nichts muss
migriert werden. Das Google-Linking (`admin-link-provider-for-user`) lief
fehlerfrei durch; der Browser-Login wurde nicht zu Ende getestet (Redirect-URI
des Spike-Pools war im Google-Client nicht eingetragen) — Restrisiko bewusst
akzeptiert, da der E-Mail-Pfad die Identitätsstabilität bereits belegt.

**Bestätigt:** Der heutige Pool `eu-central-1_z6PK2KOsC` hat
`UsernameAttributes: ["email"]` — die E-Mail *ist* dort der Username, und das ist
unveränderlich. **Ein neuer User Pool ist Pflicht.**

**Widerlegt — und das ändert den Entwurf:** Cognito lehnt eine bereits vergebene
E-Mail **nicht** ab. `verify-user-attribute` läuft durch und hängt den Alias
still auf den neuen User um; der Erstbesitzer steht danach auf
`email_verified: false` und verliert seinen E-Mail-Login (Identität, `sub` und
UUID-Login bleiben intakt). Die dokumentierte `AliasExistsException` gilt nur
für den Sign-up-Pfad, nicht für unseren Verknüpfungs-Pfad.

→ **Verbindlich für die Umsetzung:** Vor dem Setzen der E-Mail prüft ein
Server-Command per `ListUsers` mit E-Mail-Filter, ob die Adresse schon vergeben
ist. Bei Treffer führt die App nicht ins Verknüpfen, sondern in den
Einloggen-plus-Merge-Flow. Sich auf einen Cognito-Fehler zu verlassen, wäre ein
stiller Datenzugriffs-Defekt.

## Screens — entschieden (2026-08-02)

Vorschläge und verworfene Varianten stehen weiterhin in
[`apps/mobile/design/pure/proposals/accountless-screens.html`](../apps/mobile/design/pure/proposals/accountless-screens.html);
die gewählten Varianten sind als Click-Dummy unter
[`apps/mobile/design/pure/accountless/`](../apps/mobile/design/pure/accountless/)
gebaut und mit `lists.html` und `profile.html` verdrahtet.

| Stelle | Gewählt | Warum |
|---|---|---|
| Name beim ersten Teilen | **1A** Bottom Sheet über der Liste | Kein Seitenwechsel mitten im Teilen-Flow; das Sheet-Muster gibt es schon |
| Profil im Gast-Zustand | **2A** dezente Zeile „Daten sichern" | Kein Drängeln — kontenlos ist dauerhaft vollwertig, kein Dauer-Nudge |
| Daten sichern | **3B** Social zuerst, E-Mail als Nachsatz | Der Ein-Tap-Weg ohne Passwort und Postfach ist der schnellere |
| E-Mail-Weg (Adresse → Code → Fertig) | wie vorgeschlagen | Keine Alternative nötig |
| Adresse schon vergeben | **5B** eigener Zwischen-Screen | Der Fall braucht eine ganze Erklärung, nicht eine Fehlerzeile |
| Bestätigung vor dem Merge | **6A** Sheet mit Zahl | Kurz, unterbricht den Login-Fluss kaum |

**Nicht neu gebaut:** Listen-Übersicht, Einladen, Members, Sign-in und Sign-up.

## Was mit der Umstellung wegfällt

Der heutige Zustand ist ein Zwischenstand, kein Ziel. Mit der Umstellung
verschwindet er — das ist beabsichtigt und hier festgehalten, damit es beim
Umsetzen niemand für eine Regression hält:

- **Der Login-Zwang beim Start.** `/signin` ist nicht mehr der Einstieg, die App
  öffnet direkt die Listen. Der `requireAuth`-Guard an der Root-Route entfällt
  in seiner heutigen Form
- **Sign-up als Pflichtschritt vor dem Beitreten.** Der Umweg
  `/join/$token` → persistierte Join-Intent → `/signin` → zurück fällt weg: Wer
  eingeladen wird, tritt als Gast bei. Die Join-Intent bleibt nur für den Fall
  nötig, dass jemand *freiwillig* ein Konto verknüpfen will
- **„E-Mail" und „Passwort ändern" im Profil** in ihrer heutigen,
  bedingungslosen Form. Ein Gast hat beides nicht — der Profil-Screen wird
  zustandsabhängig: Gast sieht „Daten sichern" (2A), ein verknüpftes Konto sieht
  E-Mail und Passwort. Der Click-Dummy zeigt derzeit beides gleichzeitig, das ist
  nur der Zwischenstand
- **„Abmelden" im Gast-Zustand.** Es gibt kein Konto, in das man sich
  zurückmelden könnte — abmelden hieße Daten wegwerfen. Muss im Gast-Zustand
  verschwinden oder zu etwas anderem werden (z.B. „Auf diesem Gerät löschen"
  mit deutlicher Warnung)
- **Der heutige User Pool `eu-central-1_z6PK2KOsC`.** Er kann kein Schattenkonto
  (`UsernameAttributes: ["email"]`, unveränderlich), also kommt ein neuer Pool.
  **Bestehende Konten wandern nicht mit** — wer heute registriert ist, ist es
  danach nicht mehr. Vor dem Launch ist das unkritisch, es muss aber bewusst
  entschieden und nicht übersehen werden

## Umsetzung in drei Meilensteinen (entschieden 2026-08-02)

Der Implementierungsplan liegt in
[`.claude/plans/2026-08-02-ohne-konto-starten.md`](../.claude/plans/2026-08-02-ohne-konto-starten.md).
**Gebaut wird zunächst nur M1** — M2 und M3 sind dort mit allen offenen Punkten
und Review-Findings vermerkt und bekommen eigene Pläne, wenn sie drankommen:

1. **M1 — Gast-Betrieb:** Start ohne Login, lokale Urheberschaft
   (Sentinel-UserId, beim ersten Teilen auf die echte `sub` umgeschrieben),
   Schattenkonto beim ersten Teilen/Beitreten, binäre Sync-Regel
2. **M2 — Sichern (Schreibseite, vertagt):** Google/Apple/E-Mail verknüpfen,
   `ListUsers`-Guard, Konflikt-Screen 5B ohne Anmelden-Zweig. Kein Sign-in
3. **M3 — Zweitgerät (vertagt):** Anmelden auf weiteren Geräten per
   **E-Mail-OTP (präferiert — „moderner", kein Passwort-Schritt)**,
   Merge-Flow mit Screen 6A, Freundschafts-Transfer beim Merge. Die
   Passwort-Variante ist damit verworfen, sofern das M3-Design nichts
   Neues ergibt

## Status

**M1 in Planung abgeschlossen, Umsetzung noch nicht begonnen. M2/M3 vertagt
und im Plan vermerkt.**
