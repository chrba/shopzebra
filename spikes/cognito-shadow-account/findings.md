# Spike-Ergebnis: Cognito-Schattenkonto (2026-08-02)

Ausgeführt gegen einen Wegwerf-Pool (`shopzebra-spike-shadow`, seither gelöscht)
im Account 400392889907, Region eu-central-1. Skripte in diesem Ordner sind
reproduzierbar — `01-setup-pool.sh` legt die Umgebung neu an.

## Ergebnis

| # | Behauptung | Ergebnis | Beobachtung |
|---|---|---|---|
| 1 | SignUp ohne E-Mail möglich, Auto-Confirm per PreSignUp-Trigger | ✅ | `sign-up` mit UUID-Username + Zufallspasswort, **ohne jedes Attribut**. `UserConfirmed: true` direkt in der Antwort. Der angelegte User trägt exakt ein Attribut: `sub` |
| 2 | Login mit UUID-Username liefert normale JWTs | ✅ | `USER_PASSWORD_AUTH` → Id/Access/Refresh Token, `sub` = `43b48842-…` |
| 3 | E-Mail nachrüstbar, Login per E-Mail-Alias → gleiche `sub` | ✅ | `update-user-attributes` (Access-Token, kein Admin-Call) → Code per Mail → `verify-user-attribute` → Login mit E-Mail im `USERNAME`-Feld liefert **dieselbe `sub`** |
| 4 | Fremde E-Mail wird abgewiesen (`AliasExistsException`) | ❌ **widerlegt** | siehe unten — der Alias wandert **stillschweigend** |
| 5 | Google-Linking → gleiche `sub`, kein Duplikat-User | ⚪ nicht zu Ende getestet | `admin-link-provider-for-user` lief fehlerfrei durch (Google-`sub` von `cbannes@gmail.com` an frischen Schattenkonto-User gelinkt). Der Browser-Login scheiterte an `redirect_uri_mismatch` — die Spike-Domain war im bestehenden Google-OAuth-Client nicht als Redirect-URI eingetragen. **Bewusst abgebrochen** (Entscheidung 2026-08-02): Da der E-Mail-Alias-Pfad die Identitätsstabilität bereits belegt, wurde das Restrisiko akzeptiert |

## Befund 4 im Detail — der wichtigste Fund des Spikes

**Was passiert:** Ein zweiter User setzt per `update-user-attributes` dieselbe
E-Mail wie ein bestehender User. Cognito nimmt das **an** und verschickt einen
Code. Die anschließende `verify-user-attribute` läuft **erfolgreich durch** —
kein `AliasExistsException`.

**Zustand danach:**

| | User 1 (Erstbesitzer) | User 2 |
|---|---|---|
| `email` | cbannes@gmail.com | cbannes@gmail.com |
| `email_verified` | **`false`** (vorher `true`) | `true` |
| Login per E-Mail | ❌ `NotAuthorizedException` | ✅ |
| Login per UUID-Username | ✅ funktioniert weiter | ✅ |

Das deckt sich mit der Fußnote in der AWS-Doku zu Alias-Attributen
(*„Only the last user who has verified the attribute can sign in with it"*).
Die dokumentierte `AliasExistsException` gilt für den **Sign-up-Pfad**
(`ConfirmSignUp`), **nicht** für `UpdateUserAttributes`/`VerifyUserAttribute`
an einem bereits bestätigten User — also genau nicht für unseren Verknüpfungs-Pfad.

**Entschärfung:** Der Angreifer bräuchte Zugriff auf das Postfach (der Code geht
dorthin). Datenverlust entsteht nicht — Identität und `sub` von User 1 bleiben,
der UUID-Login funktioniert weiter. Verloren geht der **E-Mail-Login**.

**Konsequenz für die Umsetzung (verbindlich):** Der Verknüpfen-Flow darf sich
**nicht** darauf verlassen, dass Cognito einen Konflikt meldet. Vor dem Setzen
der E-Mail muss ein Server-Command prüfen, ob die Adresse bereits vergeben ist:

```
aws cognito-idp list-users --user-pool-id <pool> --filter 'email="…"'
```

Im Spike verifiziert: Der Filter findet beide Konten inkl. `email_verified`.
Bei Treffer führt die App **nicht** ins Verknüpfen, sondern in den
Einloggen-plus-Merge-Flow (siehe `architecture/accountless-first-planned.md`).

## Nebenbefund: Der heutige Pool kann es definitiv nicht

`eu-central-1_z6PK2KOsC` hat `UsernameAttributes: ["email"]` und
`AliasAttributes: null` — die E-Mail **ist** dort der Username. Ein Sign-up ohne
E-Mail ist unmöglich, und beide Einstellungen sind nach Pool-Erstellung
unveränderlich. **Ein neuer User Pool ist Pflicht** (und gehört dann in CDK).

## Nicht getestet (bewusst)

- **Apple Sign-In** — gleiche API (`AdminLinkProviderForUser`), braucht einen
  bezahlten Developer-Account. Restrisiko akzeptiert
- **Google-Login Ende-zu-Ende** — siehe Zeile 5
- **Change-Password** nach der E-Mail-Verknüpfung — Standard-Cognito

## Aufräumen

`99-teardown.sh` hat Pool, Domain, Lambda und IAM-Rolle gelöscht; verifiziert,
dass nur noch der Produktiv-Pool existiert. Der Produktiv-Pool wurde
ausschließlich **lesend** angefasst (IdP-Konfiguration, Google-`sub`).
