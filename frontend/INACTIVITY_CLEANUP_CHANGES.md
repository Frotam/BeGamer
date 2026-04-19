# Inactivity Cleanup Changes

This document explains the room inactivity cleanup changes added to the project.

## What Was Added

The room now tracks player presence and can clean up inactive players automatically.

Main behavior:

- If a player disconnects or closes the browser, Firebase marks them as disconnected.
- After 1 minute of being disconnected, another active room client can remove that player from the room.
- When a player is removed, their related room data is also cleaned up:
  - player entry
  - presence entry
  - voting entry
  - meeting vote entry
  - editor cursor entry
- If the removed player was the host, host ownership is transferred to the oldest remaining player.
- If the room becomes empty, `emptySince` is stored.
- Once the room has been empty for 5 minutes, the room is allowed to be deleted.

## Files Changed

### `frontend/src/context/roomActions/constants.js`

Added timing constants:

```js
export const PLAYER_INACTIVITY_TIMEOUT_MS = 60000;
export const EMPTY_ROOM_DESTROY_TIMEOUT_MS = 300000;
export const ROOM_MAINTENANCE_INTERVAL_MS = 10000;
```

These mean:

- `60000` ms = 1 minute before removing an inactive player.
- `300000` ms = 5 minutes before destroying an empty room.
- `10000` ms = active clients check room cleanup every 10 seconds.

### `frontend/src/context/roomActions/basicActions.js`

Updated `registerPresence`.

Before, presence was removed immediately on disconnect.

Now, Firebase writes:

```js
{
  connected: false,
  connectedAt: Date.now(),
  lastChangedAt: serverTimestamp()
}
```

This allows the app to know exactly when a player disconnected.

Added `runRoomInactivityMaintenance`.

This function:

- checks all players in the room
- finds players whose presence is disconnected for at least 1 minute
- removes stale players safely
- clears their votes, meeting votes, and editor cursor
- transfers host if needed
- marks the room as empty if no players remain
- deletes the room if it has been empty for at least 5 minutes

### `frontend/src/Main/Room.jsx`

Added a room maintenance loop.

While a player is inside the room, the client runs:

```js
runRoomInactivityMaintenance(roomid)
```

every 10 seconds.

This keeps the room clean without changing the existing game screens or player flow.

### `frontend/src/context/roomActions/payloads.js`

Added:

```js
emptySince: null
```

to new rooms and lobby reset payloads.

Also added `connectedAt` for the initial host player, so host transfer can choose the oldest remaining player.

### `frontend/src/context/roomActions.js`

Re-exported the new timing constants so components can use them.

### `frontend/database.rules.json`

Updated Firebase Realtime Database security rules.

The rules now allow cleanup only when it is safe:

- a player can only be removed if their presence says `connected === false`
- their disconnect timestamp must be at least 1 minute old
- empty rooms can only be deleted after `emptySince` is at least 5 minutes old
- regular users cannot randomly remove active players

## How It Works

1. Player joins a room.
2. `registerPresence(roomId)` writes their online presence.
3. Firebase `onDisconnect` is registered.
4. If the player loses connection, Firebase marks them disconnected.
5. Other active room clients keep checking the room every 10 seconds.
6. If a disconnected player has been inactive for 1 minute, they are removed.
7. If the host was removed, another player becomes host.
8. If no players remain, the room gets an `emptySince` timestamp.
9. After 5 minutes of being empty, the room can be deleted.

## Important Limitation

The cleanup code runs from active browser clients.

That means:

- Removing one inactive player works when at least one other player is still in the room.
- A completely empty room cannot run browser JavaScript by itself.

The security rules and app logic support deleting a room after 5 minutes, but for guaranteed deletion when every player has left, you should later add an always-running trusted process, such as:

- Firebase Cloud Function
- backend cron job
- backend Firebase Admin worker

## Verification

Checked:

- Firebase rules JSON parses correctly.
- Frontend production build passes with:

```bash
npm.cmd run build
```

Note:

`npm.cmd run lint` still reports existing project lint issues unrelated to this cleanup change.
