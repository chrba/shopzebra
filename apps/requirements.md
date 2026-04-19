# Requirements — ShopZebra

## List Creation

### US-1: Create a shopping list

**As a** family member
**I want to** create a new shopping list
**so that** I can plan a shopping trip.

**Acceptance criteria:**

- A list has a name (required), emoji, color, and assigned members
- A list without a name cannot be created
- Default values: emoji 🛒, color green
- A newly created list is immediately visible in the lists overview

---

### US-2: Persist list locally

**As a** family member
**I want to** have my created list survive an app restart
**so that** I can rely on the app.

**Acceptance criteria:**

- Lists are available after app kill and restart
- Domain data (id, name, memberIds) and UI preferences (color, emoji) are stored separately
- Lists are restored into the store on app start

---

### US-3: Sync list to backend

**As a** family member
**I want to** have my created list synced to the backend
**so that** other family members can see it.

**Acceptance criteria:**

- A `listCreated` event is sent to the backend after creation
- The event contains only domain data (id, name, memberIds) — no UI preferences
- Each event carries a unique `eventId` for idempotency
- The store is updated optimistically without waiting for a server response

---

### US-4: Receive a list created on another device

**As a** family member
**I want to** see lists that another family member created
**so that** we can shop together.

**Acceptance criteria:**

- A list created by another family member appears in the lists overview
- Events received from the server are not sent back to the server
- The receiving device assigns its own default preferences (color, emoji)

---

### US-5: Create a list while offline

**As a** family member
**I want to** create a list without network connectivity
**so that** the app works in a store with no reception.

**Acceptance criteria:**

- A list created offline is immediately usable (visible, editable)
- Offline events are sent to the server on reconnect
- Duplicate sends due to retries do not create duplicate lists
- There is no visible difference between online and offline created lists

---

### US-6: See up-to-date lists when opening the app

**As a** family member
**I want to** see all changes that happened while I was away
**so that** I always work with the latest state regardless of which device I use.

**Acceptance criteria:**

- On a new device with no local data, all lists the user is a member of are loaded from the server
- On a returning device, changes made on other devices since the last session are fetched and applied
- The device assigns its own default preferences (color, emoji) for lists it sees for the first time
- The lists overview reflects the latest state after sync completes
