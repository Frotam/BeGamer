You are a senior backend performance engineer.

Analyze my full-stack project (frontend + backend + WebSocket) and identify all potential performance, scalability, and reliability issues.

DO NOT generate any test scripts.

Instead, create a detailed Markdown (.md) report including:

1. Architecture overview
2. Potential bottlenecks
3. Risky patterns (async, loops, memory usage)
4. WebSocket-specific concerns
5. API performance concerns
6. Frontend performance issues (React, re-renders, state)
7. Possible memory leaks
8. Concurrency / race condition risks
9. Scaling limitations
10. Priority list of issues (high → low)

For each issue:

* explain why it is a problem
* explain when it will appear (e.g., high load, many users)
* suggest a fix

IMPORTANT:

* Do NOT assume things not present in code
* Be specific, not generic

Here is my code: <PASTE CODE HERE>
# Performance, Scalability, and Reliability Review

## 1. Architecture overview

This project currently has three main runtime parts:

- Frontend: React + Vite client with a shared `SocketContext` for all real-time communication.
- Backend HTTP API: Express server in `backend/index.js` with one main endpoint, `POST /run-code`, that writes code to disk and starts a Docker container per execution.
- Real-time backend: `ws` WebSocket server in `backend/websocket/` with in-memory room state stored in `backend/roomsStore.js`.

The game loop is stateful and server-driven:

- Room state is held in process memory via `rooms` and `yDocs`.
- Monaco/Yjs is used for collaborative editing.
- Most gameplay state changes trigger `broadcastRoomState`, which sends the full room state to every socket in the room.
- Code review is initiated over WebSocket, then loops back into the same backend over HTTP via `fetch("http://127.0.0.1:PORT/run-code")`.

## 2. Potential bottlenecks

### Issue: Docker container startup on every code run

- Location: `backend/index.js`
- Why it is a problem: every code execution starts a fresh container with `spawn("docker", [...])`, plus temp directory creation and file writes. This is high-latency and CPU-heavy compared with a pooled execution model.
- When it appears: many rooms reaching `runCode` around the same time, or frequent retries/emergency meetings.
- Suggested fix: add a concurrency limiter or worker queue for code execution, and consider a small pool of warmed execution workers instead of one container per request.

### Issue: synchronous filesystem work in the request path

- Location: `backend/index.js`, `createRunDir()` and `writeFile()`
- Why it is a problem: `fs.mkdirSync` and `fs.writeFileSync` block the Node.js event loop. While individual writes are small, they still pause all other requests and socket callbacks.
- When it appears: concurrent `run-code` traffic or slower disks/containerized deployments.
- Suggested fix: switch to async `fs.promises` APIs or move code-run file staging into a worker process.

### Issue: full document reconstruction on each Yjs update

- Location: `backend/websocket/handlers/editorHandlers.js:19-21`, `backend/websocket/services/yjsCodeService.js:84`
- Why it is a problem: every `yjs-update` rebuilds the entire code string via `getFullCodeFromYDoc(roomId)` and writes it back into room state. That makes each keystroke cost proportional to the full document size instead of only the update size.
- When it appears: larger code files, faster typing, or more editors in one room.
- Suggested fix: store the Yjs document as the source of truth during active editing and only materialize full code at checkpoints such as `runCode`, `finalizeMeeting`, or explicit save points.

### Issue: full room-state broadcast for small mutations

- Location: `backend/websocket/services/broadcastService.js:14-35` and many handlers calling `broadcastRoomState`
- Why it is a problem: chat messages, votes, meeting votes, and other small changes broadcast the entire room state object, which includes code, chat, cursor data, tasks, and player data.
- When it appears: active chats, rapid voting, frequent game-state changes, or larger room state payloads.
- Suggested fix: split messages by feature. Send targeted events such as `chatMessageAdded`, `voteUpdated`, `meetingStateChanged`, and reserve full `roomState` snapshots for join/reconnect/reset flows.

## 3. Risky patterns (async, loops, memory usage)

### Issue: unbounded in-memory chat growth

- Location: `backend/Roomactions/Basicactions.js:88`
- Why it is a problem: chat is appended to `room.chat` forever and then included in full-room broadcasts. Memory and payload size both grow without a cap.
- When it appears: long-running rooms or active chat usage.
- Suggested fix: keep only the latest N messages per room, or store chat separately and page/stream it independently from room state.

### Issue: in-memory rooms and Yjs docs have no external persistence

- Location: `backend/roomsStore.js:1-2`
- Why it is a problem: all state disappears on process restart and cannot be shared across processes or machines.
- When it appears: redeploys, crashes, horizontal scaling, or running more than one backend instance.
- Suggested fix: move room metadata to a shared store such as Redis/Postgres and use a shared pub/sub or Yjs provider strategy for collaborative state.

### Issue: duplicate validation/write path on editor updates

- Location: `backend/websocket/handlers/editorHandlers.js:19-21`
- Why it is a problem: `updatecode` is called before and after applying the Yjs update. The first call writes the old code and updates timestamps, even though the document has not changed yet.
- When it appears: every editor update.
- Suggested fix: keep the validation part separated from the write part, or only update the stored code once after the Yjs delta is applied.

### Issue: no timeout for pending WebSocket request promises

- Location: `frontend/src/context/Socketcontext.jsx:33, 95-99, 140-153`
- Why it is a problem: `pendingRequestsRef` is only cleared on ack/error or socket close. If the socket stays open but a request never gets a response, that promise stays in memory forever.
- When it appears: dropped server acks, handler exceptions before `sendAck`, or protocol mismatches.
- Suggested fix: add per-request timeout cleanup and reject stale requests after a bounded period.

## 4. WebSocket-specific concerns

### Issue: reconnect creates a brand-new user identity

- Location: `backend/websocket/connection.js:5`, `frontend/src/context/Socketcontext.jsx:51, 112`
- Why it is a problem: the backend assigns a fresh `randomUUID()` for every connection, and the frontend does not resume a prior identity. After reconnect, the player is treated as a new user.
- When it appears: temporary network loss, browser sleep/wake, mobile tab suspension, backend restart.
- Impact: the old player may be removed from the room on close, which can trigger draw/crew-win logic, while the reconnecting user re-enters as a new player or spectator.
- Suggested fix: introduce stable client identity/session resume, for example by sending a persistent user token from the client and binding reconnects to the same logical player.

### Issue: many clients can trigger the same server action at once

- Location: `frontend/src/components/Editor/Rightpage.jsx:85-113`
- Why it is a problem: every alive player runs the round timer locally and can call `sendRequest({ type: "runCode" })` when the timer expires. The backend soft-deduplicates with `room.codeRunPending`, but all clients still send traffic.
- When it appears: end of each round with multiple alive players.
- Suggested fix: make one side authoritative. The best option is a server-owned round timer. A simpler improvement is to only let the host trigger auto-run.

### Issue: no ordering/locking around room mutations

- Location: `backend/websocket/router.js:1-24`, handlers in `backend/websocket/handlers/`
- Why it is a problem: handlers mutate shared in-memory room objects directly, and multiple async actions can interleave. There is no room-level mutex or action queue.
- When it appears: overlapping `voteInMeeting`, `finalizeMeeting`, `runCode`, `startEmergencyMeeting`, disconnects during state transitions, or repeated button clicks.
- Suggested fix: serialize mutations per room using a lightweight async queue/mutex so each room processes one state transition at a time.

### Issue: full Yjs init payload is resent on several state changes

- Location: `backend/websocket/services/broadcastService.js:27-35`, plus callers in `votingHandlers` and `gameplayHandlers`
- Why it is a problem: `broadcastYDocState` sends a full encoded Yjs document to every client, not a delta. That is much heavier than the usual collaborative update path.
- When it appears: resets, finalize voting, finalize meeting, or any action that calls `broadcastYDocState`.
- Suggested fix: keep full-state broadcasts only for join/recovery flows and prefer targeted reset/version events plus incremental Yjs updates where possible.

## 5. API performance concerns

### Issue: loopback HTTP call from backend to itself

- Location: `backend/Roomactions/gameActions.js:61`
- Why it is a problem: the WebSocket server resolves code review by doing an HTTP request back into the same process. That adds JSON serialization, HTTP parsing, and one more event-loop hop.
- When it appears: every code review execution.
- Suggested fix: extract the `/run-code` logic into a shared service function and call it directly from both the Express route and the WebSocket/game action path.

### Issue: rate limiting exists, but there is no global execution backpressure

- Location: `backend/index.js` and `backend/websocket/services/codeReviewService.js`
- Why it is a problem: `express-rate-limit` protects the HTTP route per client window, but code reviews triggered internally from WebSocket actions can still fan out across many rooms with no host-level queue.
- When it appears: several active rooms hit review at once.
- Suggested fix: add a global semaphore/queue around actual execution work, with clear rejection or waiting behavior when capacity is reached.

## 6. Frontend performance issues (React, re-renders, state)

### Issue: whole room page re-renders on every cursor update

- Location: `frontend/src/Main/hooks/useRoomSocketState.js`, used by `frontend/src/Main/Room.jsx`
- Why it is a problem: `setRoomData` clones the room state on every `cursorUpdate`, so the full room page tree can re-render even though only editor cursor decorations changed.
- When it appears: multiple users moving cursors while the room page is mounted.
- Suggested fix: separate volatile cursor state from the main room snapshot, or route cursor updates directly to the editor subtree instead of replacing page-level room state.

### Issue: chat list is rebuilt and re-sorted on every room-state change

- Location: `frontend/src/components/Editor/Rightpage.jsx:42-49`
- Why it is a problem: `chatMessages` is recomputed from the full chat object whenever `data?.chat` changes, and the whole right panel still re-renders when unrelated room props change because the parent receives full room snapshots.
- When it appears: frequent room updates, active chat, or large chat history.
- Suggested fix: stop sending full room snapshots for non-chat events, and cap chat size on the backend.

### Issue: dynamically injected cursor styles are never cleaned up

- Location: `frontend/src/components/Editor/Code.jsx:19-39`
- Why it is a problem: `ensureCursorStyle` creates a `<style>` tag for each unique cursor decoration class and never removes it. Cursor line/color combinations accumulate over time.
- When it appears: long editor sessions, lots of cursor movement, many collaborators.
- Suggested fix: reuse a smaller fixed class set, or track and remove old style nodes when decorations are replaced/unmounted.

### Issue: full Monaco decoration recalculation on every cursor change

- Location: `frontend/src/components/Editor/Code.jsx:95-138`
- Why it is a problem: the effect rebuilds `lineColors`, creates classes, and calls `deltaDecorations` for all tracked cursors each time `playerCursors` changes.
- When it appears: many concurrent cursor updates.
- Suggested fix: throttle cursor broadcast frequency further, and consider only updating changed cursor lines instead of recomputing all decorations each time.

## 7. Possible memory leaks

### Issue: pending WebSocket requests can stay resident indefinitely

- Location: `frontend/src/context/Socketcontext.jsx:33, 140-153`
- Why it is a problem: unresolved promises remain in `pendingRequestsRef.current` until an ack/error or socket close happens.
- When it appears: partial server failures or protocol drift while the socket remains connected.
- Suggested fix: add a timeout per request and clear stale entries automatically.

### Issue: generated style tags accumulate in the editor

- Location: `frontend/src/components/Editor/Code.jsx:19-39`
- Why it is a problem: every new unique cursor class inserts CSS into `document.head` permanently.
- When it appears: long-lived tabs and frequent cursor movement.
- Suggested fix: centralize cursor CSS, reuse classes, or remove style nodes on cleanup.

### Issue: room state can grow without any retention policy

- Location: `backend/roomsStore.js`, `backend/Roomactions/Basicactions.js:88`
- Why it is a problem: room objects hold chat, players, code state, and Yjs docs in memory. There is no TTL or partial eviction strategy for inactive non-empty rooms.
- When it appears: many rooms created over time, users leaving tabs open, or rooms abandoned without being emptied cleanly.
- Suggested fix: add idle-room expiration and bounded per-room state sizes.

## 8. Concurrency / race condition risks

### Issue: room reset and terminal-state handling are client-driven and duplicated

- Location: `frontend/src/Main/hooks/useRoomAutoReset.js:21-50`
- Why it is a problem: the host client schedules the reset locally after 5 seconds. If the host disconnects, multiple tabs exist, or the client is throttled in the background, reset timing becomes unreliable.
- When it appears: host tab issues, browser background throttling, host reconnects during result state.
- Suggested fix: move auto-reset scheduling to the backend so it is authoritative and independent of browser behavior.

### Issue: vote finalization can race with late vote messages

- Location: `frontend/src/components/voting/Votingpage.jsx:123-164` and backend voting handlers
- Why it is a problem: clients locally stop voting based on their own timer, but WebSocket arrival order is not guaranteed relative to `finalizeVoting`. Without room-level serialization, a finalize action can interleave with a last vote.
- When it appears: slow clients or high network latency near vote expiry.
- Suggested fix: use backend-side voting deadlines and serialize vote/finalize actions per room.

### Issue: disconnect during active game mutates shared state immediately

- Location: `backend/websocket/services/roomLifecycleService.js:71-93`
- Why it is a problem: on close, the backend can remove the player and resolve the game immediately. If the disconnect is brief and the same human reconnects, the game may already have been ended because identity is not stable.
- When it appears: flaky networks or reconnecting mobile users.
- Suggested fix: combine stable identity with a grace period before removing a disconnected player from active gameplay.

## 9. Scaling limitations

### Issue: single-process architecture with in-memory coordination only

- Location: `backend/roomsStore.js`, `backend/websocket/index.js`
- Why it is a problem: rooms, players, docs, and active code reviews all live inside one Node.js process. Horizontal scaling would split rooms across instances with no shared coordination.
- When it appears: more traffic than one process can handle, or any attempt to run multiple backend replicas.
- Suggested fix: move shared state to external infrastructure and use a WebSocket sticky-session strategy or a shared pub/sub layer.

### Issue: expensive broadcasts scale with room state size, not change size

- Location: `backend/websocket/services/broadcastService.js`, room mutation handlers
- Why it is a problem: cost grows as `O(room_size * socket_count)` because the full room object is sent to every socket for many small actions.
- When it appears: larger rooms, longer chat history, more code/state attached to the room.
- Suggested fix: normalize the protocol into smaller event types and only ship the data that changed.

### Issue: code execution scales with host CPU and Docker startup overhead

- Location: `backend/index.js`, `backend/Roomactions/gameActions.js`
- Why it is a problem: execution is CPU-bound and startup-heavy. One busy set of rooms can starve the rest of the app because all orchestration still shares the same Node.js runtime.
- When it appears: many simultaneous code reviews or abuse/spikes.
- Suggested fix: move execution to a separate worker service or queue with hard concurrency limits and observability.

## 10. Priority list of issues (high to low)

### High priority

1. Reconnect creates a new player identity instead of resuming the same one.
2. Full room-state broadcasts are sent for many small changes.
3. Every Yjs update rebuilds and stores the full code string.
4. `runCode` can be triggered by many clients at once from local timers.
5. No room-level locking/serialization for async state mutations.
6. Docker-per-run execution path has no global concurrency limit.

### Medium priority

7. Pending WebSocket request promises have no timeout and can leak.
8. Chat history is unbounded in memory and in broadcast payloads.
9. Dynamic cursor style tags accumulate in `document.head`.
10. Backend calls itself over HTTP for code execution instead of using a shared service.
11. Client-driven auto-reset and vote finalization depend on browser timing.

### Low priority

12. Synchronous filesystem calls in `/run-code` block the event loop.
13. Full Yjs state is rebroadcast on several server transitions.
14. Whole room page re-renders on every cursor update.

## Suggested first fixes

If you want the highest return with the smallest architecture change, start here:

1. Give each player a stable reconnectable identity.
2. Replace broad `roomState` broadcasts with smaller feature-specific events.
3. Make the backend authoritative for round timers, vote deadlines, and auto-reset timing.
4. Stop materializing full code on every Yjs edit; only do it at execution/checkpoint boundaries.
5. Add execution backpressure for code runs.
