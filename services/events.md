# Backend Events — ShopZebra

Alle Domain Events die das Backend empfängt, validiert, speichert (DynamoDB Events Table) und per AppSync an andere Clients broadcastet.

Wire Format = Redux Action = Domain Event. Kein Mapping-Layer.

```json
{ "type": "...", "payload": { ... } }
```

---

## ShoppingList Aggregate

Aggregate-ID: `LIST#{listId}`

### listCreated
```json
{ "type": "lists/listCreated", "payload": {
    "listId": "uuid",
    "name": "Wocheneinkauf",
    "createdBy": "user-id"
}}
```

### listRenamed
```json
{ "type": "lists/listRenamed", "payload": {
    "listId": "uuid",
    "name": "Neuer Name"
}}
```

### listDeleted
```json
{ "type": "lists/listDeleted", "payload": {
    "listId": "uuid"
}}
```

### listMemberAdded
```json
{ "type": "lists/listMemberAdded", "payload": {
    "listId": "uuid",
    "memberId": "user-id"
}}
```

### listMemberRemoved
```json
{ "type": "lists/listMemberRemoved", "payload": {
    "listId": "uuid",
    "memberId": "user-id"
}}
```

### itemAdded
```json
{ "type": "shopping/itemAdded", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "name": "Elstar",
    "quantity": 1,
    "unit": "kg",
    "category": "fruits-vegetables",
    "addedBy": "user-id",
    "parentId": "apples"
}}
```
`parentId` nur bei Varianten. Generische Produkte haben kein `parentId`.

### itemChecked
```json
{ "type": "shopping/itemChecked", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "checkedBy": "user-id"
}}
```

### itemUnchecked
```json
{ "type": "shopping/itemUnchecked", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar"
}}
```

### itemRemoved
```json
{ "type": "shopping/itemRemoved", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar"
}}
```

### itemUpdated
```json
{ "type": "shopping/itemUpdated", "payload": {
    "listId": "uuid",
    "itemId": "apples--Elstar",
    "quantity": 3,
    "name": "Elstar"
}}
```
Felder optional — nur geänderte Felder im Payload.

### itemNoteUpdated
```json
{ "type": "shopping/itemNoteUpdated", "payload": {
    "listId": "uuid",
    "itemId": "apples",
    "note": "nur Bio"
}}
```

### customVariantAdded
```json
{ "type": "shopping/customVariantAdded", "payload": {
    "listId": "uuid",
    "productId": "apples",
    "variantName": "Honeycrisp"
}}
```

---

## Family Aggregate

Aggregate-ID: `FAMILY#{familyId}`

### familyCreated
```json
{ "type": "family/familyCreated", "payload": {
    "familyId": "uuid",
    "name": "Familie Müller",
    "createdBy": "user-id"
}}
```

### memberInvited
```json
{ "type": "family/memberInvited", "payload": {
    "email": "papa@example.com",
    "role": "member",
    "invitedBy": "user-id"
}}
```

### memberJoined
```json
{ "type": "family/memberJoined", "payload": {
    "memberId": "user-id",
    "name": "Papa",
    "email": "papa@example.com"
}}
```

### memberRemoved
```json
{ "type": "family/memberRemoved", "payload": {
    "memberId": "user-id"
}}
```

### preferencesUpdated
```json
{ "type": "family/preferencesUpdated", "payload": {
    "memberId": "user-id",
    "dietary": ["laktosefrei", "glutenfrei"]
}}
```

### messageSent
```json
{ "type": "family/messageSent", "payload": {
    "messageId": "uuid",
    "text": "Vergiss die Milch nicht!",
    "sentBy": "user-id"
}}
```

### reactionAdded
```json
{ "type": "family/reactionAdded", "payload": {
    "targetEventId": "event-uuid",
    "emoji": "👍",
    "reactedBy": "user-id"
}}
```

---

## Recipe Aggregate

Aggregate-ID: `RECIPE#{recipeId}`

### recipeCreated
```json
{ "type": "recipes/recipeCreated", "payload": {
    "recipeId": "uuid",
    "name": "Spaghetti Bolognese",
    "portions": 4,
    "ingredients": [
        { "name": "Spaghetti", "quantity": "500", "unit": "g" },
        { "name": "Hackfleisch", "quantity": "400", "unit": "g" }
    ],
    "instructions": "..."
}}
```

### recipeUpdated
```json
{ "type": "recipes/recipeUpdated", "payload": {
    "recipeId": "uuid",
    "name": "Spaghetti Bolognese",
    "portions": 6
}}
```

### recipeDeleted
```json
{ "type": "recipes/recipeDeleted", "payload": {
    "recipeId": "uuid"
}}
```

---

## WeekPlan Aggregate

Aggregate-ID: `PLAN#{familyId}#{year}-W{week}`

### recipeAssigned
```json
{ "type": "mealPlan/recipeAssigned", "payload": {
    "familyId": "uuid",
    "week": 15,
    "year": 2026,
    "dayOfWeek": 3,
    "recipeId": "recipe-uuid"
}}
```

### recipeUnassigned
```json
{ "type": "mealPlan/recipeUnassigned", "payload": {
    "familyId": "uuid",
    "week": 15,
    "year": 2026,
    "dayOfWeek": 3
}}
```

---

## Cross-Aggregate Event

### ingredientsCheckedOut
```json
{ "type": "mealPlan/ingredientsCheckedOut", "payload": {
    "listId": "uuid",
    "ingredients": [
        { "name": "Spaghetti", "quantity": "500", "unit": "g" },
        { "name": "Hackfleisch", "quantity": "400", "unit": "g" }
    ]
}}
```
Dispatched von MealPlan, verarbeitet vom Shopping-Reducer (erzeugt ListItems).

---

## DynamoDB Schema

### Events Table
```
PK: aggregateId     (LIST#abc, FAMILY#xyz, RECIPE#123, PLAN#fam1#2026-W15)
SK: timestamp#eventId
Attributes: type, payload, userId, familyId
GSI: familyId + timestamp  (Offline-Sync, Activity Feed)
```

### State Table (materialisierte View)
```
PK: aggregateId
Attributes: state (JSON), version
Aktualisiert via DynamoDB Stream -> Lambda Stream Processor
```

## API Endpoints

```
POST  /lists/{id}/events        Event speichern + broadcasten
GET   /lists/{id}/events        Events seit ?since=t
GET   /lists/{id}               Materialisierten State laden
GET   /sync?since=t             Alle Family-Events seit t (GSI)
POST  /family/invite            Einladung senden
```

Analog fuer `/recipes/{id}/events` und `/plans/{id}/events`.
