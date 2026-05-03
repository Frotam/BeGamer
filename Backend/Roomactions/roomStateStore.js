const redis = require("../client");
const { rooms } = require("../roomsStore");
const { buildDefaultTopics, buildEmptyCodeState } = require("./payload");

const roomKey = (roomId) => `room:${roomId}`;
const playersKey = (roomId) => `room:${roomId}:players`;
const playerKey = (roomId, userId) => `room:${roomId}:player:${userId}`;
const votesKey = (roomId) => `room:${roomId}:votes`;
const meetingVotesKey = (roomId) => `room:${roomId}:meetingVotes`;
const userRoomKey = (userId) => `user:${userId}`;
const roomStatsKey = "roomStats";

const normalizeStoredCode = (code = "") => {
  return String(code)
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
};

const serializeScalar = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
};

const deserializeNullableString = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return String(value);
};

const deserializeNullableNumber = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const deserializeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true" || value === "1" || value === 1;
};

const parseJson = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const sanitizeCodestateForPersistence = (codestate = {}) => {
  const emptyCodeState = buildEmptyCodeState();

  return {
    ...emptyCodeState,
    ...codestate,
    code:
      codestate?.code === null || codestate?.code === undefined
        ? null
        : normalizeStoredCode(codestate.code),
    updatedAt:
      codestate?.updatedAt === null || codestate?.updatedAt === undefined
        ? null
        : Number(codestate.updatedAt) || null,
    lockedRanges: Array.isArray(codestate?.lockedRanges)
      ? codestate.lockedRanges
          .map((entry) => String(entry || "").trim())
          .filter(Boolean)
      : [],
    playersCursor: {},
    tasks:
      codestate?.tasks && typeof codestate.tasks === "object"
        ? codestate.tasks
        : {},
  };
};

const restoreCodestateFromPersistence = (serializedCodestate) => {
  const parsed = parseJson(serializedCodestate, {});
  const emptyCodeState = buildEmptyCodeState();

  return {
    ...emptyCodeState,
    ...parsed,
    code:
      parsed?.code === null || parsed?.code === undefined
        ? null
        : normalizeStoredCode(parsed.code),
    updatedAt:
      parsed?.updatedAt === null || parsed?.updatedAt === undefined
        ? null
        : Number(parsed.updatedAt) || null,
    lockedRanges: Array.isArray(parsed?.lockedRanges) ? parsed.lockedRanges : [],
    playersCursor: {},
    tasks: parsed?.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
  };
};

const serializeRoomMetadata = (state = {}) => {
  return {
    createdAt: serializeScalar(state.createdAt),
    hostId: serializeScalar(state.hostId),
    winner: serializeScalar(state.winner),
    gameState: serializeScalar(state.gameState || "lobby"),
    winningTeam: serializeScalar(state.winningTeam),
    resultMessage: serializeScalar(state.resultMessage),
    gameEndedAt: serializeScalar(state.gameEndedAt),
    resetAt: serializeScalar(state.resetAt),
    emptySince: serializeScalar(state.emptySince),
    roundStartedAt: serializeScalar(state.roundStartedAt),
    votingStartedAt: serializeScalar(state.votingStartedAt),
    currentRound: serializeScalar(state.currentRound ?? 0),
    successfulRounds: serializeScalar(state.successfulRounds ?? 0),
    codeRunPending: serializeScalar(Boolean(state.codeRunPending)),
    codeRunRequestedAt: serializeScalar(state.codeRunRequestedAt),
    codeRunReason: serializeScalar(state.codeRunReason),
    meetingStartedAt: serializeScalar(state.meetingStartedAt),
    meetingReason: serializeScalar(state.meetingReason),
    lastEliminatedId: serializeScalar(state.lastEliminatedId),
    votingdone: serializeScalar(Boolean(state.votingdone)),
    imposterId: serializeScalar(state.imposterId),
    topics: JSON.stringify(state.topics || buildDefaultTopics()),
    chat: JSON.stringify(state.chat || {}),
    codestate: JSON.stringify(sanitizeCodestateForPersistence(state.codestate)),
  };
};

const serializePlayer = (player = {}, userId) => {
  return {
    uid: serializeScalar(player.uid || userId),
    name: serializeScalar(player.name),
    status: serializeScalar(player.status),
    alive: serializeScalar(player.alive !== false),
    role: serializeScalar(player.role),
    color: serializeScalar(player.color),
    connectedAt: serializeScalar(player.connectedAt),
    connected: serializeScalar(player.connected !== false),
    disconnectedAt: serializeScalar(player.disconnectedAt),
  };
};

const deserializePlayer = (playerHash = {}, userId) => {
  if (!playerHash || Object.keys(playerHash).length === 0) {
    return null;
  }

  return {
    uid: playerHash.uid || userId,
    name: playerHash.name || "",
    status: playerHash.status || "alive",
    alive: deserializeBoolean(playerHash.alive, true),
    role: playerHash.role || "Player",
    color: deserializeNullableString(playerHash.color),
    connectedAt: deserializeNullableNumber(playerHash.connectedAt),
    connected: deserializeBoolean(playerHash.connected, true),
    disconnectedAt: deserializeNullableNumber(playerHash.disconnectedAt),
  };
};

const ensureRoomCache = (roomId, state) => {
  if (!rooms[roomId]) {
    rooms[roomId] = { sockets: [], state };
    return rooms[roomId];
  }

  rooms[roomId].state = state;
  rooms[roomId].sockets = rooms[roomId].sockets || [];
  return rooms[roomId];
};

const loadRoomStateFromRedis = async (roomId) => {
  const results = await redis
    .multi()
    .hgetall(roomKey(roomId))
    .smembers(playersKey(roomId))
    .hgetall(votesKey(roomId))
    .hgetall(meetingVotesKey(roomId))
    .exec();

  const metadata = results?.[0]?.[1] || {};
  const playerIds = results?.[1]?.[1] || [];
  const votes = results?.[2]?.[1] || {};
  const meetingVotes = results?.[3]?.[1] || {};

  if (!metadata || Object.keys(metadata).length === 0) {
    return null;
  }

  const playerPipeline = redis.pipeline();
  playerIds.forEach((playerId) => {
    playerPipeline.hgetall(playerKey(roomId, playerId));
  });

  const playerResults = playerIds.length > 0 ? await playerPipeline.exec() : [];
  const players = {};

  playerIds.forEach((playerId, index) => {
    const playerHash = playerResults?.[index]?.[1] || {};
    const player = deserializePlayer(playerHash, playerId);

    if (player) {
      players[playerId] = player;
    }
  });

  return {
    createdAt: deserializeNullableNumber(metadata.createdAt),
    hostId: deserializeNullableString(metadata.hostId),
    winner: deserializeNullableString(metadata.winner),
    gameState: metadata.gameState || "lobby",
    winningTeam: deserializeNullableString(metadata.winningTeam),
    resultMessage: deserializeNullableString(metadata.resultMessage),
    gameEndedAt: deserializeNullableNumber(metadata.gameEndedAt),
    resetAt: deserializeNullableNumber(metadata.resetAt),
    emptySince: deserializeNullableNumber(metadata.emptySince),
    roundStartedAt: deserializeNullableNumber(metadata.roundStartedAt),
    votingStartedAt: deserializeNullableNumber(metadata.votingStartedAt),
    currentRound: Number(metadata.currentRound || 0),
    successfulRounds: Number(metadata.successfulRounds || 0),
    codeRunPending: deserializeBoolean(metadata.codeRunPending, false),
    codeRunRequestedAt: deserializeNullableNumber(metadata.codeRunRequestedAt),
    codeRunReason: deserializeNullableString(metadata.codeRunReason),
    meetingStartedAt: deserializeNullableNumber(metadata.meetingStartedAt),
    meetingVotes,
    meetingReason: deserializeNullableString(metadata.meetingReason),
    lastEliminatedId: deserializeNullableString(metadata.lastEliminatedId),
    topics: parseJson(metadata.topics, buildDefaultTopics()),
    votingdone: deserializeBoolean(metadata.votingdone, false),
    votes,
    players,
    chat: parseJson(metadata.chat, {}),
    codestate: restoreCodestateFromPersistence(metadata.codestate),
    imposterId: deserializeNullableString(metadata.imposterId),
  };
};

const getRoomState = async (roomId) => {
  const roomObj = rooms[roomId];

  if (roomObj?.state) {
    return roomObj.state;
  }

  const persistedState = await loadRoomStateFromRedis(roomId);

  if (!persistedState) {
    throw new Error("Room not found.");
  }

  ensureRoomCache(roomId, persistedState);
  return persistedState;
};

const persistRoomMetadata = async (roomId, state, pipeline = null) => {
  const target = pipeline || redis.pipeline();
  target.hset(roomKey(roomId), serializeRoomMetadata(state));

  if (!pipeline) {
    await target.exec();
  }
};

const persistPlayerState = async (
  roomId,
  userId,
  player,
  { setMembership = true, setUserMapping = true, pipeline = null } = {},
) => {
  const target = pipeline || redis.pipeline();
  target.hset(playerKey(roomId, userId), serializePlayer(player, userId));

  if (setMembership) {
    target.sadd(playersKey(roomId), userId);
  }

  if (setUserMapping) {
    target.set(userRoomKey(userId), roomId);
  }

  if (!pipeline) {
    await target.exec();
  }
};

const persistVotes = async (roomId, votes, pipeline = null) => {
  const target = pipeline || redis.pipeline();
  target.del(votesKey(roomId));

  if (votes && Object.keys(votes).length > 0) {
    target.hset(votesKey(roomId), votes);
  }

  if (!pipeline) {
    await target.exec();
  }
};

const persistMeetingVotes = async (roomId, meetingVotes, pipeline = null) => {
  const target = pipeline || redis.pipeline();
  target.del(meetingVotesKey(roomId));

  if (meetingVotes && Object.keys(meetingVotes).length > 0) {
    target.hset(meetingVotesKey(roomId), meetingVotes);
  }

  if (!pipeline) {
    await target.exec();
  }
};

const syncRoomStateToRedis = async (
  roomId,
  state,
  { updateUserMappings = false } = {},
) => {
  const existingPlayerIds = await redis.smembers(playersKey(roomId));
  const nextPlayerIds = Object.keys(state.players || {});
  const stalePlayerIds = existingPlayerIds.filter(
    (playerId) => !state.players?.[playerId],
  );
  const pipeline = redis.pipeline();

  pipeline.hset(roomKey(roomId), serializeRoomMetadata(state));
  pipeline.sadd("activeRooms", roomId);

  if (nextPlayerIds.length > 0) {
    pipeline.del(playersKey(roomId));
    pipeline.sadd(playersKey(roomId), ...nextPlayerIds);
  } else {
    pipeline.del(playersKey(roomId));
  }

  nextPlayerIds.forEach((playerId) => {
    pipeline.hset(
      playerKey(roomId, playerId),
      serializePlayer(state.players[playerId], playerId),
    );

    if (updateUserMappings) {
      pipeline.set(userRoomKey(playerId), roomId);
    }
  });

  stalePlayerIds.forEach((playerId) => {
    pipeline.del(playerKey(roomId, playerId));
    pipeline.del(userRoomKey(playerId));
  });

  pipeline.del(votesKey(roomId));
  if (state.votes && Object.keys(state.votes).length > 0) {
    pipeline.hset(votesKey(roomId), state.votes);
  }

  pipeline.del(meetingVotesKey(roomId));
  if (state.meetingVotes && Object.keys(state.meetingVotes).length > 0) {
    pipeline.hset(meetingVotesKey(roomId), state.meetingVotes);
  }

  await pipeline.exec();
};

const recordRoomCreated = async (pipeline = null) => {
  const target = pipeline || redis.pipeline();
  target.hincrby(roomStatsKey, "totalCreated", 1);

  if (!pipeline) {
    await target.exec();
  }
};

const removePlayerState = async (roomId, userId, pipeline = null) => {
  const target = pipeline || redis.pipeline();
  target.del(playerKey(roomId, userId));
  target.srem(playersKey(roomId), userId);
  target.hdel(votesKey(roomId), userId);
  target.hdel(meetingVotesKey(roomId), userId);
  target.del(userRoomKey(userId));

  if (!pipeline) {
    await target.exec();
  }
};

const deleteRoomState = async (roomId, playerIds = []) => {
  const knownPlayerIds = new Set([
    ...playerIds,
    ...(await redis.smembers(playersKey(roomId))),
  ]);
  const pipeline = redis.pipeline();

  pipeline.del(roomKey(roomId));
  pipeline.del(playersKey(roomId));
  pipeline.del(votesKey(roomId));
  pipeline.del(meetingVotesKey(roomId));
  pipeline.del(`room:${roomId}:chat`);
  pipeline.del(`room:${roomId}:code`);
  pipeline.srem("activeRooms", roomId);
  pipeline.hincrby(roomStatsKey, "totalDeleted", 1);

  knownPlayerIds.forEach((playerId) => {
    pipeline.del(playerKey(roomId, playerId));
    pipeline.del(userRoomKey(playerId));
  });

  await pipeline.exec();
};

module.exports = {
  deleteRoomState,
  ensureRoomCache,
  getRoomState,
  loadRoomStateFromRedis,
  persistMeetingVotes,
  persistPlayerState,
  persistRoomMetadata,
  persistVotes,
  recordRoomCreated,
  removePlayerState,
  roomKey,
  roomStatsKey,
  syncRoomStateToRedis,
  userRoomKey,
};
