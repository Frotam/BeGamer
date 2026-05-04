# Engineering Review

This report audits the current real-time backend implementation. It is based on the active code in `Backend`, with `docker-heater` treated as reference code for deployed preheated runner services.

## Critical Bugs

### Room creation acknowledges before event-driven Redis sync is guaranteed

Severity: High

Explanation: `createRoom` stores the room in memory, calls `joinRoom`, emits `Room_created`, then immediately sends `roomCreated` and `ack` to the client. The Redis sync listener runs asynchronously and catches errors internally.

References: `Backend/websocket/handlers/roomEntryHandlers.js:27`, `Backend/websocket/handlers/roomEntryHandlers.js:33`, `Backend/websocket/handlers/roomEntryHandlers.js:35`, `Backend/events/Redishandler.js:4`

Why it matters: The client can believe the room exists even if the full room snapshot failed to persist. If the process crashes shortly after creation, the room can be lost or partially persisted.

Suggested fix: Make initial room persistence part of the synchronous create command, then emit events only for non-critical side effects.

```js
await syncRoomStateToRedis(roomId, state, { updateUserMappings: true });
eventBus.emit("Room_created", { roomId, userId, username });
send(ws, { type: "roomCreated", roomId, state });
```

### Room id generation can collide and overwrite an active room

Severity: High

Explanation: Room ids are generated with `Math.random().toString(36).slice(2, 8)` and assigned directly into `rooms[roomId]` without checking memory or Redis.

Reference: `Backend/websocket/handlers/roomEntryHandlers.js:24`

Why it matters: A collision would replace an existing room in memory, disconnecting state from active sockets and corrupting Redis mappings.

Suggested fix: Use `crypto.randomUUID()` or retry until neither memory nor Redis contains the room id.

```js
let roomId;
do {
  roomId = crypto.randomBytes(4).toString("hex");
} while (rooms[roomId] || await redis.exists(roomKey(roomId)));
```

### Concurrent room mutations can overwrite each other

Severity: High

Explanation: Most commands read a mutable room object, change fields, and persist a full snapshot or partial hash without version checks. Examples include `startVoting`, `finalizeVotingRound`, `runCode`, `resolveCodeRun`, `finalizeMeeting`, `sendmessage`, and `updatecode`.

References: `Backend/Roomactions/roomStateStore.js:328`, `Backend/Roomactions/gameActions.js:90`, `Backend/Roomactions/gameActions.js:127`, `Backend/Roomactions/Basicactions.js:76`

Why it matters: Two socket messages arriving close together can interleave. A room state sync can delete and rewrite vote hashes while another vote is writing. A stale snapshot can overwrite newer chat, votes, code, or game state.

Suggested fix: Introduce a room-level mutation queue or Redis-side optimistic locking with a `version` field. For a single-node quick fix, serialize command execution per room.

```js
await roomLocks.runExclusive(roomId, async () => {
  const room = await getRoomState(roomId);
  mutate(room);
  room.version = (room.version || 0) + 1;
  await syncRoomStateToRedis(roomId, room);
});
```

### Code review failure state is broadcast but not persisted in one path

Severity: High

Explanation: `runServerCodeReview` catches errors, mutates the in-memory room into `meeting`, and broadcasts the room state. It does not persist that fallback state to Redis.

Reference: `Backend/websocket/services/codeReviewService.js:32`

Why it matters: If the process restarts after this error path, Redis can still contain `codeRunPending: true` or an older `playing` state. Reconnected clients may see a stuck or incorrect game.

Suggested fix: Persist the fallback room state before broadcasting.

```js
await syncRoomStateToRedis(roomId, room);
broadcastRoomState(roomId);
```

## Architectural Issues

### Event-driven architecture is applied inconsistently

Severity: Medium

Explanation: `Room_created` uses the event bus, but other important domain changes are direct command calls. The event listener also performs critical persistence, while most other persistence happens synchronously.

References: `Backend/websocket/handlers/roomEntryHandlers.js:35`, `Backend/events/Redishandler.js:4`

Why it matters: It is hard to know which side effects are guaranteed before an ack. This can produce inconsistent reliability behavior across flows.

Suggested fix: Define the boundary clearly. Use command functions for required persistence and reserve events for optional side effects like metrics, notifications, or audit logs.

### WebSocket access depends on local in-memory room cache

Severity: Medium

Explanation: `assertRoomAccess` checks only `rooms[roomId]`. Join can hydrate from Redis, but most other actions cannot.

Reference: `Backend/websocket/services/roomAccessService.js:4`

Why it matters: On multi-instance deployments, a socket connected to a different backend process will not see rooms owned by another instance unless it joins and hydrates locally. Live fanout is also limited to local sockets.

Suggested fix: Use sticky sessions as a short-term deployment requirement. Longer term, add Redis Pub/Sub or Streams for cross-node room events and hydrate room state consistently in the access layer.

### Domain logic and transport logic are still tightly coupled

Severity: Medium

Explanation: WebSocket handlers decide when to persist Yjs, when to broadcast, when to start background reviews, and when to ack. Domain commands return mutated state but do not own publication semantics.

References: `Backend/websocket/handlers/gameplayHandlers.js`, `Backend/websocket/handlers/editorHandlers.js`

Why it matters: New flows can easily forget a persistence, broadcast, or ack step. The behavior is spread across handlers and command functions.

Suggested fix: Introduce application services such as `RoomCommandService.runCodeAndScheduleReview` that own command execution, persistence, and publication decisions.

### Production runner model is implicit

Severity: Medium

Explanation: The repo contains `docker-heater` as deployed preheated runner reference code, while the active backend worker path uses Docker CLI containers. Production service URLs are environment-level knowledge rather than explicit code configuration in the backend.

References: `Backend/worker/worker.js:160`, `docker-heater/js/server.js`

Why it matters: New engineers may misunderstand which execution path is active in each environment.

Suggested fix: Document the modes and add explicit env names such as `CODE_RUNNER_MODE=local-docker|remote-preheated` and `CODE_RUNNER_BASE_URL`.

## Potential Bugs

### Yjs update persists stale code before applying the incoming update

Severity: Medium

Explanation: `yjsUpdate` calls `updatecode` with `roomObj.state.codestate?.code` before applying the Yjs update, then applies the update, then persists the full Yjs text.

Reference: `Backend/websocket/handlers/editorHandlers.js:19`

Why it matters: The first write is redundant and can race with other updates. It also updates `updatedAt` before the actual new code exists.

Suggested fix: Validate edit permission without writing. Then apply the Yjs update and persist once.

```js
ensureCanEdit(room, ws.userId);
Y.applyUpdate(doc, update);
await updatecode(roomId, getFullCodeFromYDoc(roomId), ws.userId);
```

### Cursor updates are never persisted but are stored on room state

Severity: Low

Explanation: `updatecursor` mutates `room.codestate.playersCursor` and returns without Redis persistence. Persistence sanitization also clears `playersCursor`.

References: `Backend/Roomactions/Basicactions.js:54`, `Backend/Roomactions/roomStateStore.js:87`

Why it matters: This is acceptable for ephemeral cursors, but misleading because cursor state appears in room state yet is intentionally non-durable.

Suggested fix: Treat cursors as explicitly ephemeral transport state, separate from persisted `codestate`, or document the behavior in code.

### Meeting/code review can resolve after the room changed

Severity: Medium

Explanation: `runServerCodeReview` checks room state before executing. The code run can take up to the HTTP timeout, and then `executeCodeAndResolve` uses whatever room state exists at resolution time.

References: `Backend/websocket/services/codeReviewService.js:22`, `Backend/Roomactions/gameActions.js:288`

Why it matters: If the host resets, players leave, or another flow changes the room during execution, the result can apply to a different logical round.

Suggested fix: Store a `codeRunId` or `roundId` when starting review and require the same id when resolving.

### `/run-code` input validation is minimal

Severity: Medium

Explanation: The endpoint reads `code` and `language` directly from the request body and enqueues the job. Express has a body size limit, but language and code shape are validated later in the worker.

Reference: `Backend/index.js:38`

Why it matters: Invalid jobs still consume queue capacity and worker attempts. Public exposure of this endpoint increases abuse risk.

Suggested fix: Validate language and non-empty code before enqueueing. Keep the rate limit, but add auth or an internal secret if this endpoint is only meant for backend-initiated review.

### `activeCodeReviews` suppresses duplicate review requests without notifying callers

Severity: Low

Explanation: If a review is already active, `runServerCodeReview` returns silently.

Reference: `Backend/websocket/services/codeReviewService.js:14`

Why it matters: A client can receive an ack even though its execute request did not start a new review. This may be intended, but the protocol does not communicate it.

Suggested fix: Return a status such as `{ started: false, reason: "already_running" }` and include it in the ack.

## Scalability Risks

### Live rooms are single-node despite Redis persistence

Severity: High

Explanation: Room sockets and Yjs documents live in process memory. Redis can reload state, but it does not distribute Yjs updates or broadcasts across backend instances.

References: `Backend/roomsStore.js`, `Backend/websocket/services/broadcastService.js`

Why it matters: Horizontal scaling will split players across processes unless sticky sessions are enforced. Even with sticky sessions, failover loses in-memory Yjs documents and active socket membership.

Suggested fix: Start with sticky sessions and one active room owner. For real scaling, add a room event channel and distributed Yjs synchronization strategy.

### Full room broadcasts can become expensive

Severity: Medium

Explanation: Many actions broadcast the entire `room.state`, including chat and codestate metadata, to every socket.

Reference: `Backend/websocket/services/broadcastService.js`

Why it matters: As rooms, chat, or code metadata grows, every small change sends increasingly large payloads.

Suggested fix: Broadcast typed patches for chat, votes, cursors, and state transitions. Keep full snapshots for join/recovery.

### Docker socket mounting is high risk

Severity: High

Explanation: `docker-compose.yml` mounts `/var/run/docker.sock` into both app and worker containers. The worker uses the Docker CLI to create execution containers.

References: `Backend/docker-compose.yml`, `Backend/worker/worker.js:160`

Why it matters: Access to the Docker socket is effectively host-level control if the application container is compromised.

Suggested fix: Run execution on isolated infrastructure. Use a locked-down runner service, rootless containers, gVisor/Firecracker-style isolation, strict resource limits, and no Docker socket in the public app container.

### Worker containers lack explicit CPU and memory limits

Severity: Medium

Explanation: The worker disables networking and has timeouts, but `docker create` does not set memory, CPU, pids, filesystem, or read-only limits.

Reference: `Backend/worker/worker.js:160`

Why it matters: Malicious or accidental code can consume host resources within the timeout window.

Suggested fix: Add Docker constraints such as `--memory`, `--cpus`, `--pids-limit`, `--read-only`, `--cap-drop=ALL`, and a writable tmpfs when needed.

## Code Quality Improvements

### Naming is inconsistent across socket actions and files

Severity: Low

Explanation: Socket types mix casing styles: `createroom`, `Updatecode`, `sendChat`, `runCode`, `finalizeVoting`. Some files also contain legacy names such as `Basicactions`.

Why it matters: Inconsistent protocol names increase frontend/backend integration mistakes.

Suggested fix: Standardize action names, for example all lower camel case: `createRoom`, `updateCode`, `sendChat`.

### Dead or experimental code should be isolated

Severity: Low

Explanation: `Backend/Queue/queue.js` contains duplicate declarations and experimental queue/server code. `Backend/events/sockethandler.js` contains commented event logic.

References: `Backend/Queue/queue.js`, `Backend/events/sockethandler.js`

Why it matters: Dead code makes the actual architecture harder to understand and can break if accidentally executed.

Suggested fix: Move experiments to `docs/experiments` or delete them once the architecture is settled.

### Redis serialization is hand-written and broad

Severity: Medium

Explanation: Room serialization manually converts many fields and stores nested structures as JSON inside a hash. Snapshot writes also rewrite multiple related keys.

Reference: `Backend/Roomactions/roomStateStore.js:116`

Why it matters: Adding a field requires updates in several functions. Missing a field can cause state loss after reload.

Suggested fix: Centralize schema validation with a typed room-state schema and add round-trip tests for serialization/deserialization.

### No automated tests for critical multiplayer flows

Severity: High

Explanation: `Backend/package.json` has no real test script, and the reviewed flows have many edge cases: duplicate joins, reconnects, host transfer, voting, code execution, meeting finalization, and Redis reload.

Why it matters: Real-time state bugs often appear only under ordering edge cases. Without tests, refactors are risky.

Suggested fix: Add integration tests around command functions first, then WebSocket protocol tests with fake clients and a test Redis instance.

## Highest Priority Fixes

1. Make room creation persistence synchronous before ack.
2. Add collision-safe room id generation.
3. Serialize per-room mutations or add optimistic Redis versioning.
4. Persist all code-review fallback states.
5. Add a documented execution mode for local Docker worker vs deployed preheated runners.
6. Add container resource limits and avoid Docker socket exposure in production-facing services.
