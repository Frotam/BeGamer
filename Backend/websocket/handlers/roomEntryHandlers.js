const { rooms } = require("../../roomsStore");
const { buildInitialRoomData } = require("../../Roomactions/payload");
const { joinRoom } = require("../../Roomactions/Basicactions");

const createRoomEntryHandlers = ({
  send,
  sendAck,
  assertRoomAccess,
  attachSocketToRoom,
  getYDoc,
  Y,
  broadcastRoomState,
}) => {
  const createRoom = async (ws, data) => {
    const username = String(data.username || "").trim();
    const userId = ws.userId;

    if (!username || !userId) {
      throw new Error("Username is required.");
    }

    const roomId = Math.random().toString(36).slice(2, 8);
    const state = buildInitialRoomData(userId, username);

    rooms[roomId] = { sockets: [], state };

    ws.username = username;
    ws.userId = userId;
    ws.user.uid = userId;

    attachSocketToRoom(roomId, ws);
    joinRoom(roomId, userId, username);

    send(ws, { type: "roomCreated", roomId, state });
    sendAck(ws, data.requestId, { roomId });
  };

  const requestYjsState = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    attachSocketToRoom(roomId, ws);

    const doc = getYDoc(roomId);
    const state = Y.encodeStateAsUpdate(doc);

    send(ws, { type: "yjs-init", roomId, update: Array.from(state) });
    sendAck(ws, data.requestId);
  };

  const join = async (ws, data) => {
    const roomId = String(data.roomId || "").trim();
    const username = String(data.username || "").trim();
    const userId = ws.userId;

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
    }

    ws.username = username;
    ws.userId = userId;
    ws.user.uid = userId;
    ws.roomId = roomId;

    attachSocketToRoom(roomId, ws);
    joinRoom(roomId, userId, username);

    const doc = getYDoc(roomId);
    const state = Y.encodeStateAsUpdate(doc);

    send(ws, { type: "yjs-init", roomId, update: Array.from(state) });
    broadcastRoomState(roomId);
    send(ws, { type: "playerJoined", roomId });
    sendAck(ws, data.requestId, { roomId });
  };

  return {
    createroom: createRoom,
    join,
    "request-yjs-state": requestYjsState,
  };
};

module.exports = {
  createRoomEntryHandlers,
};
