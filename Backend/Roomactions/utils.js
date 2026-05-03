const Colors = require("./colors");
const redis = require("../client");

const PLAYER_COLORS = Colors

const getWinningTopic = (votes = {}) => {
  const voteCounts = {};
  let winner = null;
  let maxVotes = 0;

  Object.values(votes).forEach((topicId) => {
    voteCounts[topicId] = (voteCounts[topicId] || 0) + 1;

    if (voteCounts[topicId] > maxVotes) {
      maxVotes = voteCounts[topicId];
      winner = topicId;
    }
  });

  return { winner, maxVotes };
};

const normalizeStoredCode = (code = "") => {
  return String(code)
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
};



const hasUsableCode = (code) => {
  return typeof code === "string" && code.trim().length > 0;
};

const getSnippetCode = (snippet) => {
  return normalizeStoredCode(snippet?.code || snippet?.starterCode || "");
};

const removePlayer = async (room, roomId, userId) => {
  delete room.state.players[userId];
  if (room.state.votes) {
    delete room.state.votes[userId];
  }
  if (room.state.meetingVotes) {
    delete room.state.meetingVotes[userId];
  }
  if (room.state.codestate?.playersCursor) {
    delete room.state.codestate.playersCursor[userId];
  }
  room.sockets = room.sockets.filter(
    (s) => s.user?.uid !== userId,
  );
  const pipeline = redis.pipeline();
  pipeline.del(`room:${roomId}:player:${userId}`);
  pipeline.srem(`room:${roomId}:players`, userId);
  pipeline.hdel(`room:${roomId}:votes`, userId);
  pipeline.hdel(`room:${roomId}:meetingVotes`, userId);
  pipeline.del(`user:${userId}`);
  await pipeline.exec();
};

const normalizeLockedRanges = (lockedRanges) => {
  if (!Array.isArray(lockedRanges)) {
    return [];
  }

  return lockedRanges
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
};

const getRoleKey = (role) => {
  return String(role || "player").trim().toLowerCase();
};

const getRoleTaskConfig = (tasks = {}, role) => {
  const roleKey = getRoleKey(role);
  const roleTask = tasks?.[roleKey] || tasks?.[role] || null;

  if (roleTask && typeof roleTask === "object") {
    return roleTask;
  }

  return null;
};

const sanitizeRoleTaskConfig = (taskConfig) => {
  if (!taskConfig || typeof taskConfig !== "object") {
    return null;
  }

  const rawInstructions = taskConfig.instructions;
  let instructions = [];

  if (Array.isArray(rawInstructions)) {
    instructions = rawInstructions
      .map((instruction) => String(instruction || "").trim())
      .filter(Boolean);
  } else if (typeof rawInstructions === "string" && rawInstructions.trim()) {
    instructions = [rawInstructions.trim()];
  }

  return {
    type: getRoleKey(taskConfig.type || taskConfig.role),
    instructions,
    expectedOutput: taskConfig.expectedOutput || null,
  };
};

const normalizeOutputLines = (output) => {
  const normalized = String(output || "")
    .replace(/,/g, "\n")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }

  return normalized;
};

const getExpectedOutputLines = (taskConfig) => {
  if (!taskConfig || typeof taskConfig !== "object") {
    return [];
  }

  const expectedOutput = taskConfig.expectedOutput;

  if (Array.isArray(expectedOutput)) {
    return expectedOutput.map((line) => String(line).trim());
  }

  if (typeof expectedOutput === "string") {
    return normalizeOutputLines(expectedOutput);
  }

  return [];
};

const compareOutputs = (actualOutput, expectedTaskConfig) => {
  const actualLines = normalizeOutputLines(actualOutput);
  const expectedLines = getExpectedOutputLines(expectedTaskConfig);

  if (actualLines.length !== expectedLines.length) {
    return false;
  }

  return actualLines.every((line, index) => line === expectedLines[index]);
};

const ensureRoomPlayer = (room, user) => {
  const userId = typeof user === "string" ? user : user?.uid;
  const player = room?.players?.[userId];

  if (!player) {
    throw new Error("Player is not part of this room.");
  }

  return player;
};

const ensureAlivePlayer = (room, user) => {
  const player = ensureRoomPlayer(room, user);

  if (player.alive === false || player.status === "dead") {
    throw new Error("Spectators cannot perform this action.");
  }

  return player;
};

const pickPlayerColors = (playerIds) => {
  const colors = [...PLAYER_COLORS];

  for (let i = colors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, colors[index % colors.length]])
  );
};

const getAlivePlayerIds = (players = {}) => {
  return Object.entries(players)
    .filter(([, player]) => player?.alive !== false)
    .map(([playerId]) => playerId);
};

const getMeetingVoteSummary = (votes = {}) => {
  const counts = {};
  let highestVoteCount = 0;

  Object.values(votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
    highestVoteCount = Math.max(highestVoteCount, counts[targetId]);
  });

  const topTargets = Object.entries(counts)
    .filter(([, count]) => count === highestVoteCount)
    .map(([targetId]) => targetId);

  return { highestVoteCount, topTargets };
};

const buildResetPlayers = (players = {}) => {
  return Object.fromEntries(
    Object.entries(players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        alive: true,
        status: "alive",
        role: "Player",
      },
    ])
  );
};

const shouldImposterWinByParity = (room) => {
  const alivePlayerIds = getAlivePlayerIds(room?.players || {});

  if (alivePlayerIds.length !== 2 || !room?.imposterId) {
    return false;
  }

  return alivePlayerIds.includes(room.imposterId);
};

const transferHost = async (room, roomId) => {
  const playersById = room.state.players || {};
  const playerIds = Object.keys(playersById);
  let newHostId = null;
  if (playerIds.length > 0) {
    playerIds.sort((a, b) => {
      const aTime = Number(playersById[a]?.connectedAt || 0);
      const bTime = Number(playersById[b]?.connectedAt || 0);
      return aTime - bTime;
    });
    newHostId = playerIds[0];
  }
  room.state.hostId = newHostId;
  await redis.hset(`room:${roomId}`, {
    hostId: newHostId || "",
  });
};

module.exports = {
  buildResetPlayers,
  compareOutputs,
  ensureAlivePlayer,
  ensureRoomPlayer,
  getAlivePlayerIds,
  getExpectedOutputLines,
  getMeetingVoteSummary,
  getRoleKey,
  getRoleTaskConfig,
  getSnippetCode,
  getWinningTopic,
  hasUsableCode,
  normalizeLockedRanges,
  normalizeOutputLines,
  normalizeStoredCode,
  pickPlayerColors,
  sanitizeRoleTaskConfig,
  shouldImposterWinByParity,
  removePlayer,
  transferHost,
};
