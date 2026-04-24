const WebSocket = require("ws");
const { buildInitialRoomData } = require("../Roomactions/payload");
const { rooms } = require("../roomsStore");
const {
  joinRoom,
  sendmessage,
  updatecode,
  updatecursor,
  voteForTopic,
} = require("../Roomactions/Basicactions");
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
          broadcastRoomState(data.roomId);
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
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "Updatecode") {
          updatecode(data.roomId, data.code, ws.userId);
          broadcastRoomState(data.roomId);
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
          runCode(data.roomId, ws.userId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "executeCodeAndResolve") {
          const room = rooms[data.roomId]?.state;
          const snippet = await fetchSnippetFromFirebase(room?.winner);
          await executeCodeAndResolve(data.roomId, ws.userId, snippet);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "startEmergencyMeeting") {
          startEmergencyMeeting(data.roomId, ws.userId, data.reason);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "voteInMeeting") {
          voteInMeeting(data.roomId, ws.userId, data.targetId);
          broadcastRoomState(data.roomId);
          sendAck(ws, requestId);
          return;
        }

        if (data.type === "finalizeMeeting") {
          finalizeMeeting(data.roomId, ws.userId);
          broadcastRoomState(data.roomId);
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
