const WebSocket = require("ws");
const { buildInitialRoomData } = require("../Roomactions/payload");
const { rooms, yDocs } = require("../roomsStore");
const {
  joinRoom,
  sendmessage,
  updatecode,
  updatecursor,
  voteForTopic,
} = require("../Roomactions/Basicactions");
const { normalizeStoredCode } = require("../Roomactions/utils");
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

  wss.on("connection", (ws) => {
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
        if (data.type === "createroom") {
          const username = String(data.username || "").trim();
          const userId = String(data.uid || "").trim();

          if (!username || !userId) {
            throw new Error("Username and uid are required.");
          }

          const roomId = Math.random().toString(36).slice(2, 8);
          const state = buildInitialRoomData(userId, username);

          rooms[roomId] = {
            sockets: [],
            state,
          };

          ws.username = username;
          ws.userId = userId;
          attachSocketToRoom(roomId, ws);

          send(ws, {
            type: "roomCreated",
            roomId,
            state,
          });
          sendAck(ws, requestId, { roomId });
          return;
        }
        if (data.type === "yjs-update") {
          const roomObj = rooms[data.roomId];

          if (!roomObj) return;

          const doc = getYDoc(data.roomId);
          const update = Uint8Array.from(data.update);

          updatecode(data.roomId, roomObj.state.codestate?.code || "", ws.userId);
          Y.applyUpdate(doc, update);
          updatecode(data.roomId, getFullCodeFromYDoc(data.roomId), ws.userId);

          roomObj.sockets.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(
                JSON.stringify({
                  type: "yjs-update",
                  roomId: data.roomId,
                  update: data.update,
                }),
              );
            }
          });

          return;
        }
        if (data.type === "request-yjs-state") {
          const roomId = String(data.roomId || "").trim();

          if (!roomId || !rooms[roomId]) {
            throw new Error("Room not found.");
          }

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
          const userId = String(data.uid || "").trim();

          if (!roomId || !username || !userId) {
            throw new Error("roomId, username, and uid are required.");
          }

          const roomObj = rooms[roomId];

          if (!roomObj) {
            throw new Error("Room not found");
          }

          // 🔥 CANCEL CLEANUP TIMER (IMPORTANT)
          if (roomObj.cleanupTimer) {
            clearTimeout(roomObj.cleanupTimer);
            roomObj.cleanupTimer = null;
            roomObj.emptySince = null;

            console.log(`Cleanup cancelled for room ${roomId}`);
          }

          ws.username = username;
          ws.userId = userId;
          ws.roomId = roomId;

          attachSocketToRoom(roomId, ws);

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

        if (data.type === "startVoting") {
          startVoting(data.roomId, ws.userId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "vote") {
          voteForTopic(data.roomId, ws.userId, data.topicId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "resetRoom") {
          resetRoom(data.roomId, ws.userId);
          replaceYDocTextFromRoom(data.roomId);
          broadcastRoomState(data.roomId);
          broadcastYDocState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "finalizeVoting") {
          const roomObj = rooms[data.roomId];
          const winner = roomObj?.state?.winner || null;
          const resolvedWinner =
            winner || Object.values(roomObj?.state?.votes || {}).find(Boolean);

          if (!resolvedWinner) {
            throw new Error("No winning topic was found.");
          }

          const snippet = await fetchSnippetFromFirebase(resolvedWinner);
          finalizeVotingRound(data.roomId, ws.userId, snippet);
          replaceYDocTextFromRoom(data.roomId);
          broadcastRoomState(data.roomId);
          broadcastYDocState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "Updatecode") {
          updatecode(data.roomId, data.code, ws.userId);
          replaceYDocTextFromRoom(data.roomId);

          broadcastRoomState(data.roomId);
          broadcastYDocState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "updateCursor") {
          updatecursor(data.roomId, ws.userId, {
            line: data.line,
            column: data.column,
          });

          broadcast(data.roomId, {
            type: "cursorUpdate",
            userId: ws.userId,
            line: data.line,
            column: data.column,
          });
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "sendChat") {
          sendmessage(data.roomId, ws.userId, data.message);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "runCode") {
          persistSubmittedCodeForRun(data.roomId, data.code);
          runCode(data.roomId, ws.userId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          void runServerCodeReview(data.roomId);
          return;
        }

        if (data.type === "executeCodeAndResolve") {
          persistSubmittedCodeForRun(data.roomId, data.code);
          void runServerCodeReview(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "startEmergencyMeeting") {
          persistSubmittedCodeForRun(data.roomId, data.code);
          startEmergencyMeeting(data.roomId, ws.userId, data.reason);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          void runServerCodeReview(data.roomId);
          return;
        }

        if (data.type === "voteInMeeting") {
          voteInMeeting(data.roomId, ws.userId, data.targetId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "finalizeMeeting") {
          persistRoomCodeFromYDoc(data.roomId);
          finalizeMeeting(data.roomId, ws.userId);
          broadcastRoomState(data.roomId);
          broadcastYDocState(data.roomId);
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
      if (!roomId || !rooms[roomId]) return;

      const roomObj = rooms[roomId];

      // remove socket
      roomObj.sockets = roomObj.sockets.filter((client) => client !== ws);

      if (roomObj.sockets.length === 0) {
        roomObj.emptySince = Date.now();

        roomObj.cleanupTimer = setTimeout(
          () => {
            if (rooms[roomId] && rooms[roomId].sockets.length === 0) {
              delete rooms[roomId];
              delete yDocs[roomId];
              console.log(`Room ${roomId} deleted due to inactivity`);
            }
          },
          10 * 60 * 1000,
        ); // 10 min
      }
    });
  });
}

module.exports = registerRoom;
