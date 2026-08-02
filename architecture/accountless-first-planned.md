# Ohne Konto starten — geplant, noch nicht entworfen

> ⚠️ **Das ist Zukunft, kein Ist-Zustand und kein fertiger Entwurf.**
> Heute erzwingt die App ein Cognito-Konto vor allem anderen. Was hier steht,
> ist die **Absicht** — sie muss noch geplant und entschieden werden, bevor
> jemand daran baut. Der Zweck dieses Dokuments ist, dass wir bei neuen
> Entscheidungen nicht versehentlich Türen zumauern.

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

## Was offen ist

Nichts davon ist entschieden — die Liste zeigt nur, wie groß der Entwurf wird:

- Womit weist sich ein Gerät ohne Konto gegenüber der API aus?
- Was passiert beim Verknüpfen, wenn das Konto schon Daten hat — zusammenführen
  oder ersetzen?
- Was passiert mit geteilten Listen, wenn der kontenlose Partner sein Gerät
  verliert? Ohne Konto gibt es keine Wiederherstellung.
- Bleibt kontenloses Arbeiten dauerhaft möglich, oder ist es nur ein
  Probierzustand mit Aufforderung zur Registrierung?
- Wie wirkt sich das auf die Anzeigenamen aus, die andere Mitglieder sehen?

## Status

**Vorgemerkt, nicht geplant.** Der nächste Schritt wäre ein eigenes Brainstorming
mit anschließendem Design — nicht Code.
