const crypto = require("crypto");
const { rooms } = require("../roomsStore");
const { ensureAlivePlayer, ensureRoomPlayer, normalizeStoredCode } = require("./utils");

const getRoomState = (roomId) => {
  const roomObj = rooms[roomId];

  if (!roomObj) {
    throw new Error("Room not found.");
  }

  return roomObj.state;
};

const voteForTopic = (roomId, userId, topicId) => {
  const room = getRoomState(roomId);

  ensureRoomPlayer(room, userId);

  if (room.gameState !== "voting") {
    throw new Error("Voting is not active.");
  }

  if (!room.topics?.[topicId]) {
    throw new Error("Invalid topic selected.");
  }

  room.votes[userId] = topicId;
  return room;
};

const updatecode = (roomId, code, userId) => {
  const room = getRoomState(roomId);

  ensureAlivePlayer(room, userId);

  if (room.gameState !== "playing") {
    throw new Error("Code can only be edited during gameplay.");
  }

  if (room.codeRunPending) {
    throw new Error("Code editing is paused while the code result is being reviewed.");
  }

  room.codestate.code = normalizeStoredCode(code);
  room.codestate.updatedAt = Date.now();
  return room;
};

const updatecursor = (roomId, userId, cursor = {}) => {
  const room = getRoomState(roomId);

  ensureAlivePlayer(room, userId);

  if (room.gameState !== "playing") {
    throw new Error("Cursor updates are only allowed during gameplay.");
  }

  const line = Math.max(1, Number(cursor.line) || 1);
  const column = Math.max(1, Number(cursor.column) || 1);

  room.codestate.playersCursor = room.codestate.playersCursor || {};
  room.codestate.playersCursor[userId] = {
    line,
    column,
    updatedAt: Date.now(),
  };

  return room;
};

const sendmessage = (roomId, userId, message) => {
  const room = getRoomState(roomId);
  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage) {
    throw new Error("Message cannot be empty.");
  }

  const player = ensureAlivePlayer(room, userId);

  if (room.codeRunPending && room.gameState === "playing") {
    throw new Error("Chat is disabled while the code result is being reviewed.");
  }

  const messageId = crypto.randomUUID();
  room.chat = room.chat || {};
  room.chat[messageId] = {
    uid: userId,
    name: player.name || "Player",
    text: trimmedMessage,
    createdAt: Date.now(),
  };

  return room;
};

const joinRoom = (roomId, userId, playerName) => {
  const room = getRoomState(roomId);
  const trimmedName = String(playerName || "").trim();

  if (!trimmedName) {
    throw new Error("Username is required.");
  }

  const existingPlayer = room.players?.[userId] || null;
  if (existingPlayer) {
    room.players[userId] = {
      ...existingPlayer,
      name: trimmedName || existingPlayer.name,
      connectedAt: Date.now(),
    };
    return room;
  }
  const isLiveGame = room.gameState === "playing" || room.gameState === "meeting";
  const isSpectator = isLiveGame;

  room.players[userId] = {
    uid: userId,
    name: trimmedName,
    status: isSpectator ? "spectating" : "alive",
    alive: !isSpectator,
    role: existingPlayer?.role || "Player",
    color: existingPlayer?.color,
    connectedAt: Date.now(),
  };

  return room;
};

module.exports = {
  joinRoom,
  sendmessage,
  updatecode,
  updatecursor,
  getRoomState,
  voteForTopic,
};
