# Job Stories — Sync & Backend API

## 1. Listen teilen

**When** I create a new shopping list for the family,
**I want to** invite family members via link or QR code,
**so I can** shop together without setting up anything complicated.

**When** I receive a share link from a family member,
**I want to** open it and immediately see the shared list in my app,
**so I can** start adding items right away.

**When** I no longer want someone on my list,
**I want to** remove them with one tap,
**so I can** control who sees and edits my list.

## 2. Echtzeit-Sync

**When** my partner adds milk to the shared list while I'm in the store,
**I want to** see it appear on my phone within seconds,
**so I can** grab it before I leave the aisle.

**When** I check off an item during shopping,
**I want to** have it instantly visible as checked on all other devices,
**so I can** avoid duplicate purchases.

**When** two family members add the same item at the same time,
**I want to** see both entries and easily merge them,
**so I can** avoid confusion without losing anyone's input.

## 3. Offline & Reconnect

**When** I'm in a store with no reception,
**I want to** keep adding and checking off items as usual,
**so I can** finish shopping without interruption.

**When** my phone reconnects after being offline,
**I want to** have all my changes automatically synced to the server,
**so I can** avoid manual re-entry or lost data.

**When** I was offline and my partner also made changes,
**I want to** see both sets of changes merged without conflicts,
**so I can** trust that the list is always up to date.

## 4. Events & Aktivitäts-History

**When** I open a shared list,
**I want to** see who added or changed which item and when,
**so I can** understand what happened while I wasn't looking.

**When** my partner checks off the last item on the list,
**I want to** get a notification that shopping is done,
**so I can** stop worrying about it.

**When** someone adds an urgent item to a shared list,
**I want to** receive a push notification,
**so I can** pick it up if I'm already near a store.

## 5. API — Daten lesen & schreiben

**When** the app starts,
**I want to** load all my lists and their current state from the server,
**so I can** see an up-to-date overview immediately.

**When** I add, edit, or delete an item,
**I want to** have that change sent as an event to the backend,
**so I can** trust that nothing gets lost.

**When** I've been offline and reopen the app,
**I want to** fetch only the events since my last sync,
**so I can** get up to date quickly without downloading everything.

## 6. Authentifizierung & Autorisierung

**When** I open a shared list link,
**I want to** only gain access if the owner actually invited me,
**so I can** trust that strangers can't see my family's list.

**When** I'm logged in on a new device,
**I want to** see all my lists immediately after sign-in,
**so I can** switch devices without losing anything.

## 7. Benachrichtigungen

**When** someone changes a shared list I'm part of,
**I want to** receive a notification only for important changes (new items, urgent flags),
**so I can** stay informed without being spammed.

**When** I'm actively shopping a list,
**I want to** see live updates in-app without push notifications,
**so I can** focus on shopping without notification noise.
