const crypto = require("crypto");
const redis = require("../client");
const {
  getRoomState,
  persistPlayerState,
  persistRoomMetadata,
} = require("./roomStateStore");
const {
  ensureAlivePlayer,
  ensureRoomPlayer,
  normalizeStoredCode,
} = require("./utils");

const voteForTopic = async (roomId, userId, topicId) => {
  const room = await getRoomState(roomId);

  ensureRoomPlayer(room, userId);

  if (room.gameState !== "voting") {
    throw new Error("Voting is not active.");
  }

  if (!room.topics?.[topicId]) {
    throw new Error("Invalid topic selected.");
  }

  room.votes[userId] = topicId;
  await redis.hset(`room:${roomId}:votes`, userId, topicId);
  return room;
};

const updatecode = async (roomId, code, userId) => {
  const room = await getRoomState(roomId);

  ensureAlivePlayer(room, userId);

  if (room.gameState !== "playing") {
    throw new Error("Code can only be edited during gameplay.");
  }

  if (room.codeRunPending) {
    throw new Error(
      "Code editing is paused while the code result is being reviewed.",
    );
  }

  room.codestate.code = normalizeStoredCode(code);
  room.codestate.updatedAt = Date.now();

  await persistRoomMetadata(roomId, room);
  return room;
};

const updatecursor = async (roomId, userId, cursor = {}) => {
  const room = await getRoomState(roomId);

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

const sendmessage = async (roomId, userId, message) => {
  const room = await getRoomState(roomId);
  const trimmedMessage = String(message || "").trim();

  if (!trimmedMessage) {
    throw new Error("Message cannot be empty.");
  }

  const player = ensureAlivePlayer(room, userId);

  if (room.codeRunPending && room.gameState === "playing") {
    throw new Error(
      "Chat is disabled while the code result is being reviewed.",
    );
  }

  const messageId = crypto.randomUUID();
  room.chat = room.chat || {};
  room.chat[messageId] = {
    uid: userId,
    name: player.name || "Player",
    text: trimmedMessage,
    createdAt: Date.now(),
  };

  await persistRoomMetadata(roomId, room);
  return room;
};

const joinRoom = async (roomId, userId, playerName) => {
  const room = await getRoomState(roomId);
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
      connected: true,
      disconnectedAt: null,
    };

    await persistPlayerState(roomId, userId, room.players[userId], {
      setMembership: true,
      setUserMapping: true,
    });

    return room;
  }

  const isLiveGame =
    room.gameState === "playing" || room.gameState === "meeting";
  const isSpectator = isLiveGame;

  room.players[userId] = {
    uid: userId,
    name: trimmedName,
    status: isSpectator ? "spectating" : "alive",
    alive: !isSpectator,
    role: existingPlayer?.role || "Player",
    color: existingPlayer?.color,
    connectedAt: Date.now(),
    connected: true,
    disconnectedAt: null,
  };

  await persistPlayerState(roomId, userId, room.players[userId], {
    setMembership: true,
    setUserMapping: true,
  });

  return room;
};

module.exports = {
  getRoomState,
  joinRoom,
  sendmessage,
  updatecode,
  updatecursor,
  voteForTopic,
};
