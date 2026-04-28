const WebSocket = require("ws");
const { randomUUID } = require("crypto");
const { URL } = require("url");
const { buildInitialRoomData } = require("../Roomactions/payload");
const { rooms, yDocs } = require("../roomsStore");
const {
  joinRoom,
  sendmessage,
  updatecode,
  updatecursor,
  voteForTopic,
} = require("../Roomactions/Basicactions");
const { normalizeStoredCode, removePlayer, transferHost } = require("../Roomactions/utils");
const Y = require("yjs");

const splitMainSection = (code = "") => {
  const normalizedCode = String(code || "");
  const match = normalizedCode.match(/^[ \t]*int\s+main\s*\(/m);

  if (!match) {
    return { editorCode: normalizedCode, hiddenMain: "" };
  }

  const startIndex = match.index;

  return {
    editorCode: `${normalizedCode.slice(0, startIndex).replace(/[\s\n]*$/u, "")}\n`,
    hiddenMain: normalizedCode.slice(startIndex),
  };
};

const getYDoc = (roomId) => {
  if (!yDocs[roomId]) {
    const doc = new Y.Doc();

    const roomObj = rooms[roomId];
    const initialCode = splitMainSection(
      roomObj?.state?.codestate?.code || "",
    ).editorCode;

    const yText = doc.getText("monaco");

    if (initialCode) {
      yText.insert(0, initialCode);
    }

    yDocs[roomId] = doc;
  }

  return yDocs[roomId];
};

const replaceYDocTextFromRoom = (roomId) => {
  const roomObj = rooms[roomId];

  if (!roomObj) {
    return null;
  }

  const doc = getYDoc(roomId);
  const yText = doc.getText("monaco");
  const nextEditorCode = splitMainSection(
    roomObj.state?.codestate?.code || "",
  ).editorCode;

  doc.transact(() => {
    yText.delete(0, yText.length);

    if (nextEditorCode) {
      yText.insert(0, nextEditorCode);
    }
  });

  return doc;
};

const persistRoomCodeFromYDoc = (roomId, fullCode) => {
  const roomObj = rooms[roomId];

  if (!roomObj?.state?.codestate) {
    return;
  }

  const normalizedFullCode =
    typeof fullCode === "string" ? normalizeStoredCode(fullCode) : null;

  if (normalizedFullCode !== null) {
    roomObj.state.codestate.code = normalizedFullCode;
  } else {
    const yText = getYDoc(roomId).getText("monaco");
    const { hiddenMain } = splitMainSection(roomObj.state.codestate.code || "");
    roomObj.state.codestate.code = normalizeStoredCode(
      `${yText.toString()}${hiddenMain}`,
    );
  }

  roomObj.state.codestate.updatedAt = Date.now();
};

const getFullCodeFromYDoc = (roomId) => {
  const roomObj = rooms[roomId];

  if (!roomObj?.state?.codestate) {
    return "";
  }

  const yText = getYDoc(roomId).getText("monaco");
  const { hiddenMain } = splitMainSection(roomObj.state.codestate.code || "");

  return normalizeStoredCode(`${yText.toString()}${hiddenMain}`);
};

const getReviewSnippetFromRoom = (room) => {
  const tasks = room?.codestate?.tasks;

  if (!tasks?.player || !tasks?.imposter) {
    throw new Error("Stored task data is missing for this room.");
  }

  return {
    tasks,
  };
};

const persistSubmittedCodeForRun = (roomId, code) => {
  const room = rooms[roomId]?.state;

  if (!room || room.codeRunPending) {
    return;
  }

  persistRoomCodeFromYDoc(roomId, code);

  if (typeof code === "string") {
    replaceYDocTextFromRoom(roomId);
  }
};

const {
  executeCodeAndResolve,
  finalizeMeeting,
  finalizeVotingRound,
  resetRoom,
  runCode,
  startEmergencyMeeting,
  startVoting,
  voteInMeeting,
} = require("../Roomactions/gameActions");
const {
  fetchSnippetFromFirebase,
} = require("../Roomactions/firebasefunctions");
function registerRoom(server) {
  const wss = new WebSocket.Server({ server });
  const activeCodeReviews = new Set();
  const sessionStore = new Map();

  const send = (ws, payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const sendAck = (ws, requestId, payload = {}) => {
    if (!requestId) {
      return;
    }

    send(ws, {
      type: "ack",
      requestId,
      ...payload,
    });
  };

  const sendError = (ws, message, requestId) => {
    send(ws, {
      type: "error",
      message,
      requestId,
    });
  };

  const isValidSessionId = (value) => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || ""),
    );
  };

  const createSessionId = () => {
    let sessionId = randomUUID();
    while (sessionStore.has(sessionId)) {
      sessionId = randomUUID();
    }
    sessionStore.set(sessionId, { createdAt: Date.now(), lastSeenAt: Date.now() });
    return sessionId;
  };

  const resolveInitialSessionId = (request) => {
    try {
      const parsedUrl = new URL(request.url || "/", "ws://localhost");
      const candidate = String(parsedUrl.searchParams.get("sessionId") || "").trim();
      if (isValidSessionId(candidate) && sessionStore.has(candidate)) {
        sessionStore.get(candidate).lastSeenAt = Date.now();
        return candidate;
      }
    } catch {
      // Ignore malformed URL and issue a fresh session id.
    }

    return createSessionId();
  };

  const assertBoundSession = (ws, payload) => {
    const providedSessionId = String(payload?.sessionId || "").trim();
    const boundSessionId = String(ws.sessionId || "").trim();

    if (!providedSessionId || !boundSessionId || providedSessionId !== boundSessionId) {
      throw new Error("Invalid session.");
    }

    const session = sessionStore.get(boundSessionId);
    if (!session) {
      throw new Error("Session expired.");
    }

    session.lastSeenAt = Date.now();
    ws.userId = boundSessionId;
  };



  

  const countUserSockets = (roomObj, userId) => {
    if (!roomObj || !userId) return 0;
    return (roomObj.sockets || []).filter(
      (client) => client && client.readyState === WebSocket.OPEN && client.userId === userId,
    ).length;
  };

  const ensureHostExists = (roomObj) => {
    if (!roomObj?.state) return;
    const hostId = roomObj.state.hostId;
    if (hostId && roomObj.state.players?.[hostId]) return;
    transferHost(roomObj);
  };

  const startDisconnectedTimer = (roomId, roomObj, userId) => {
    if (!roomObj.disconnected) roomObj.disconnected = {};
    if (roomObj.disconnected[userId]?.timeout) return;

    const timeout = setTimeout(() => {
      if (!rooms[roomId] || !rooms[roomId].disconnected?.[userId]) {
        return;
      }

      removePlayer(rooms[roomId], userId);
      ensureHostExists(rooms[roomId]);
      delete rooms[roomId].disconnected[userId];
      broadcastRoomState(roomId);
    }, 60 * 1000);

    roomObj.disconnected[userId] = {
      timeout,
      disconnectedAt: Date.now(),
    };
  };

  const destroyRoomIfEmpty = (roomId, roomObj) => {
    const playerCount = Object.keys(roomObj?.state?.players || {}).length;
    if (playerCount > 0) return false;

    if (roomObj.cleanupTimer) {
      clearTimeout(roomObj.cleanupTimer);
      roomObj.cleanupTimer = null;
    }

    delete rooms[roomId];
    delete yDocs[roomId];
    return true;
  };

  const getPlayerIds = (roomObj) => {
    return Object.keys(roomObj?.state?.players || {});
  };

  const destroyRoomIfSoloHostDisconnect = (roomId, roomObj, userId) => {
    const playerIds = getPlayerIds(roomObj);
    if (playerIds.length === 1 && playerIds[0] === userId) {
      removePlayer(roomObj, userId);
      destroyRoomIfEmpty(roomId, roomObj);
      return true;
    }
    return false;
  };

  const broadcast = (roomId, payload) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      return;
    }

    roomObj.sockets.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });
  };

  const broadcastYDocState = (roomId) => {
    const doc = getYDoc(roomId);
    const state = Y.encodeStateAsUpdate(doc);

    broadcast(roomId, {
      type: "yjs-init",
      roomId,
      update: Array.from(state),
    });
  };

  const broadcastRoomState = (roomId) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      return;
    }

    broadcast(roomId, {
      type: "roomState",
      state: roomObj.state,
    });
  };

  const getRoomObject = (roomId) => {
    const normalizedRoomId = String(roomId || "").trim();

    if (!normalizedRoomId) {
      throw new Error("Room not found.");
    }

    const roomObj = rooms[normalizedRoomId];

    if (!roomObj) {
      throw new Error("Room not found.");
    }

    return { roomId: normalizedRoomId, roomObj };
  };

  const assertRoomAccess = (ws, roomId) => {
    const { roomId: normalizedRoomId, roomObj } = getRoomObject(roomId);
    const userId = String(ws?.userId || "").trim();

    if (!userId) {
      throw new Error("Unauthorized access.");
    }

    if (!roomObj.state?.players?.[userId]) {
      throw new Error("Unauthorized access.");
    }

    if (ws.roomId && ws.roomId !== normalizedRoomId) {
      throw new Error("Unauthorized access.");
    }

    return { roomId: normalizedRoomId, roomObj };
  };

  const runServerCodeReview = async (roomId) => {
    if (!roomId || activeCodeReviews.has(roomId)) {
      return;
    }

    activeCodeReviews.add(roomId);

    try {
      const room = rooms[roomId]?.state;

      if (!room || room.gameState !== "playing" || !room.codeRunPending) {
        return;
      }

      console.log(`[CODE_REVIEW] Starting review for room ${roomId}`);
      const snippet = getReviewSnippetFromRoom(room);
      await executeCodeAndResolve(roomId, null, snippet);
      broadcastRoomState(roomId);
    } catch (error) {
      const room = rooms[roomId]?.state;

      if (room) {
        room.codeRunPending = false;
        room.codeRunRequestedAt = null;
        room.codeRunReason = null;
        room.gameState = "meeting";
        room.resultMessage = null;
        room.meetingStartedAt = Date.now();
        room.meetingVotes = {};
        room.meetingReason = `Code review could not run: ${error.message}`;
      }

      broadcastRoomState(roomId);
      console.error(`Code review failed for room ${roomId}:`, error);
    } finally {
      activeCodeReviews.delete(roomId);
    }
  };

  const attachSocketToRoom = (roomId, ws) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      throw new Error("Room not found.");
    }

    if (ws.roomId && ws.roomId !== roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].sockets = rooms[ws.roomId].sockets.filter(
        (client) => client !== ws,
      );
    }

    ws.roomId = roomId;

    if (!roomObj.sockets.includes(ws)) {
      roomObj.sockets.push(ws);
    }
  };

  wss.on("connection", (ws, request) => {
    const sessionId = resolveInitialSessionId(request);
    ws.sessionId = sessionId;
    ws.userId = sessionId;
    ws.user = { uid: sessionId, name: null };

    send(ws, {
      type: "session",
      sessionId,
    });

    ws.on("message", async (message) => {
      let data;

      try {
        data = JSON.parse(message);
      } catch {
        sendError(ws, "Invalid JSON received.");
        return;
      }

      const { requestId } = data;

      try {
        assertBoundSession(ws, data);

        if (data.type === "createroom") {
          const username = String(data.username || "").trim();
          const userId = ws.sessionId;
          if (!username || !userId) {
            throw new Error("Username is required.");
          }
           

          const roomId = Math.random().toString(36).slice(2, 8);
          const state = buildInitialRoomData(userId, username);

          rooms[roomId] = {
            sockets: [],
            state,
          };
          
          ws.username = username;
          ws.userId = userId;
          ws.user.uid = userId;
           
          attachSocketToRoom(roomId, ws);
        
          joinRoom(roomId,userId,username)

          send(ws, {
            type: "roomCreated",
            roomId,
            state,
          });
          sendAck(ws, requestId, { roomId });
          return;
        }
        if (data.type === "yjs-update") {
          const { roomId, roomObj } = assertRoomAccess(ws, data.roomId);
          const doc = getYDoc(roomId);
          const update = Uint8Array.from(data.update);

          updatecode(roomId, roomObj.state.codestate?.code || "", ws.userId);
          Y.applyUpdate(doc, update);
          updatecode(roomId, getFullCodeFromYDoc(roomId), ws.userId);

          roomObj.sockets.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "yjs-update",
                  roomId,
                  update: data.update,
                }),
              );
            }
          });

          return;
        }
        if (data.type === "request-yjs-state") {
          const { roomId } = assertRoomAccess(ws, data.roomId);

          attachSocketToRoom(roomId, ws);

          const doc = getYDoc(roomId);
          const state = Y.encodeStateAsUpdate(doc);

          send(ws, {
            type: "yjs-init",
            roomId,
            update: Array.from(state),
          });
          sendAck(ws, requestId);
          return;
        }
        if (data.type === "join") {
          const roomId = String(data.roomId || "").trim();
          const username = String(data.username || "").trim();
          const userId = ws.sessionId;

          if (!roomId || !username || !userId) {
            throw new Error("roomId and username are required.");
          }

          const roomObj = rooms[roomId];

          if (!roomObj) {
            throw new Error("Room not found");
          }

          if (roomObj.cleanupTimer) {
            clearTimeout(roomObj.cleanupTimer);
            roomObj.cleanupTimer = null;
            roomObj.emptySince = null;

            console.log(`Cleanup cancelled for room ${roomId}`);
          }

          ws.username = username;
          ws.userId = userId;
          ws.user.uid = userId;
          ws.roomId = roomId;

          attachSocketToRoom(roomId, ws);

          if (roomObj.disconnected?.[userId]?.timeout) {
            clearTimeout(roomObj.disconnected[userId].timeout);
            delete roomObj.disconnected[userId];
          }

          joinRoom(roomId, userId, username);

          // broadcast updated state
          const doc = getYDoc(roomId);
          const state = Y.encodeStateAsUpdate(doc);

          send(ws, {
            type: "yjs-init",
            roomId,
            update: Array.from(state),
          });
          broadcastRoomState(roomId);

          send(ws, { type: "playerJoined", roomId });

          sendAck(ws, requestId, { roomId });

          return;
        }

        if (data.type === "leaveRoom") {
          const roomId = String(data.roomId || "").trim();
          const roomObj = rooms[roomId];

          // Idempotent leave: if room is already gone, do not treat it as an error.
          if (!roomId || !roomObj) {
            sendAck(ws, requestId);
            return;
          }

          if (!ws.userId || !roomObj.state?.players?.[ws.userId]) {
            sendAck(ws, requestId);
            return;
          }

          const userId = ws.userId;

          if (roomObj.disconnected?.[userId]?.timeout) {
            clearTimeout(roomObj.disconnected[userId].timeout);
            delete roomObj.disconnected[userId];
          }

          roomObj.sockets = roomObj.sockets.filter((client) => client !== ws);
          ws.roomId = null;

          const gameState = roomObj.state?.gameState;
          const hasActiveConnection = countUserSockets(roomObj, userId) > 0;

          if (!hasActiveConnection) {
            if (destroyRoomIfSoloHostDisconnect(roomId, roomObj, userId)) {
              sendAck(ws, requestId);
              return;
            }

            if (gameState === "lobby") {
              removePlayer(roomObj, userId);
              ensureHostExists(roomObj);
              if (destroyRoomIfEmpty(roomId, roomObj)) {
                sendAck(ws, requestId);
                return;
              }
              broadcastRoomState(roomId);
            } else {
              startDisconnectedTimer(roomId, roomObj, userId);
              ensureHostExists(roomObj);
              broadcastRoomState(roomId);
            }
          }

          sendAck(ws, requestId);
          return;
        }

        if (data.type === "startVoting") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          startVoting(roomId, ws.userId);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "vote") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          voteForTopic(roomId, ws.userId, data.topicId);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "resetRoom") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          resetRoom(roomId, ws.userId);
          replaceYDocTextFromRoom(roomId);
          broadcastRoomState(roomId);
          broadcastYDocState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "finalizeVoting") {
          const { roomId, roomObj } = assertRoomAccess(ws, data.roomId);
          const winner = roomObj?.state?.winner || null;
          const resolvedWinner =
            winner || Object.values(roomObj?.state?.votes || {}).find(Boolean);

          if (!resolvedWinner) {
            throw new Error("No winning topic was found.");
          }

          const snippet = await fetchSnippetFromFirebase(resolvedWinner);
          finalizeVotingRound(roomId, ws.userId, snippet);
          replaceYDocTextFromRoom(roomId);
          broadcastRoomState(roomId);
          broadcastYDocState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "Updatecode") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          updatecode(roomId, data.code, ws.userId);
          replaceYDocTextFromRoom(roomId);

          broadcastRoomState(roomId);
          broadcastYDocState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "updateCursor") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          updatecursor(roomId, ws.userId, {
            line: data.line,
            column: data.column,
          });

          broadcast(roomId, {
            type: "cursorUpdate",
            userId: ws.userId,
            line: data.line,
            column: data.column,
          });
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "sendChat") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          sendmessage(roomId, ws.userId, data.message);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "runCode") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          persistSubmittedCodeForRun(roomId, data.code);
          runCode(roomId, ws.userId);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          void runServerCodeReview(roomId);
          return;
        }

        if (data.type === "executeCodeAndResolve") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          persistSubmittedCodeForRun(roomId, data.code);
          void runServerCodeReview(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "startEmergencyMeeting") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          persistSubmittedCodeForRun(roomId, data.code);
          startEmergencyMeeting(roomId, ws.userId, data.reason);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          void runServerCodeReview(roomId);
          return;
        }

        if (data.type === "voteInMeeting") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          voteInMeeting(roomId, ws.userId, data.targetId);
          broadcastRoomState(roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "finalizeMeeting") {
          const { roomId } = assertRoomAccess(ws, data.roomId);
          persistRoomCodeFromYDoc(roomId);
          finalizeMeeting(roomId, ws.userId);
          broadcastRoomState(roomId);
          broadcastYDocState(roomId);
          sendAck(ws, requestId);
          return;
        }

        throw new Error("Unsupported websocket action.");
      } catch (error) {
        sendError(ws, error.message || "Request failed.", requestId);
      }
    });

  ws.on("close", () => {
    const roomId = ws.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;

    const userId = ws.userId || ws.user?.uid;
    if (!userId) return;

    room.sockets = room.sockets.filter((c) => c !== ws);

    const gameState = room.state?.gameState;
    const hasActiveConnection = countUserSockets(room, userId) > 0;
    if (hasActiveConnection) return;

    if (destroyRoomIfSoloHostDisconnect(roomId, room, userId)) {
      return;
    }

    if (gameState === "lobby") {
      removePlayer(room, userId);
      ensureHostExists(room);
      if (destroyRoomIfEmpty(roomId, room)) {
        return;
      }
      broadcastRoomState(roomId);
      return;
    }

    startDisconnectedTimer(roomId, room, userId);
    ensureHostExists(room);
    broadcastRoomState(roomId);
  });
  });
}

module.exports = registerRoom;
