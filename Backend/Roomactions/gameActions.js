const crypto = require("crypto");
const { rooms } = require("../roomsStore");
const { buildLobbyResetPayload } = require("./payload");
const redis = require("../client");
const {
  compareOutputs,
  ensureAlivePlayer,
  ensureRoomPlayer,
  getAlivePlayerIds,
  getMeetingVoteSummary,
  getRoleTaskConfig,
  getSnippetCode,
  getWinningTopic,
  hasUsableCode,
  normalizeLockedRanges,
  normalizeStoredCode,
  pickPlayerColors,
  sanitizeRoleTaskConfig,
  shouldImposterWinByParity,
} = require("./utils");
const { log } = require("console");

const TOTAL_GAME_ROUNDS = 3;
const SUPPORTED_CODE_LANGUAGES = new Set(["cpp", "javascript", "python"]);
const INTERNAL_BACKEND_URL = process.env.INTERNAL_BACKEND_URL;

const getRoomState = (roomId) => {
  const roomObj = rooms[roomId];

  if (!roomObj) {
    throw new Error("Room not found.");
  }

  return roomObj.state;
};

const buildTaskState = (snippet) => {
  const playerTask = sanitizeRoleTaskConfig(
    getRoleTaskConfig(snippet?.tasks || {}, "player"),
  );
  const imposterTask = sanitizeRoleTaskConfig(
    getRoleTaskConfig(snippet?.tasks || {}, "imposter"),
  );

  const tasks = {};

  if (playerTask) {
    tasks.player = {
      instructions: playerTask.instructions,
      expectedOutput: playerTask.expectedOutput,
    };
  }

  if (imposterTask) {
    tasks.imposter = {
      instructions: imposterTask.instructions,
      expectedOutput: imposterTask.expectedOutput,
    };
  }

  return tasks;
};

const runSubmittedCode = async ({ code, language }) => {
  const port = Number(process.env.PORT) || 5000;
  const backendUrl = INTERNAL_BACKEND_URL || `http://127.0.0.1:${port}`;
  console.log(
    `[CODE_REVIEW] Running ${language} code (${Buffer.byteLength(code, "utf8")} bytes)`,
  );
  //  throw new Error("test error")

  const response = await fetch(`${backendUrl}/run-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      language,
    }),
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Code runner returned an invalid response.");
  }

  if (!response.ok || !payload?.success) {
    return `Error: ${payload?.error || "Compilation failed."}`;
  }

  console.log(
    `[CODE_REVIEW] Output: ${JSON.stringify(String(payload.output || ""))}`,
  );
  return String(payload.output || "");
};

const startVoting = async (roomId, userId) => {
  const room = await getRoomState(roomId);

  const totalPlayers = Object.keys(room.players || {}).length;

  if (room.hostId !== userId) {
    throw new Error("Only the host can start voting.");
  }

  if (totalPlayers < 3) {
    throw new Error("At least 3 players are required to start voting.");
  }

  room.gameState = "voting";
  room.winningTeam = null;
  room.resultMessage = null;
  room.gameEndedAt = null;
  room.resetAt = null;
  room.votingStartedAt = Date.now();
  room.roundStartedAt = null;
  room.currentRound = 0;
  room.successfulRounds = 0;
  room.codeRunPending = false;
  room.codeRunRequestedAt = null;
  room.codeRunReason = null;
  room.meetingStartedAt = null;
  room.meetingVotes = {};
  room.meetingReason = null;
  room.lastEliminatedId = null;
  room.votingdone = false;
  room.votes = {};
  room.winner = null;

  const pipeline = redis.pipeline();

  pipeline.hset(`room:${roomId}`, {
    gameState: room.gameState,
    votingStartedAt: room.votingStartedAt,
    currentRound: room.currentRound,
    successfulRounds: room.successfulRounds,
    codeRunPending: room.codeRunPending,
  });

  pipeline.del(`room:${roomId}:votes`);

  await pipeline.exec();

  return room;
};

const finalizeVotingRound = async (roomId, userId, snippet) => {
  const room = await getRoomState(roomId);

  if (room.hostId !== userId) {
    throw new Error("Only the host can continue the game.");
  }

  if (room.gameState !== "voting") {
    throw new Error("Voting is not active.");
  }

  const { winner, maxVotes } = getWinningTopic(room.votes || {});
  const playerIds = Object.keys(room.players || {});
  const existingRoomCode = normalizeStoredCode(room.codestate?.code || "");

  if (maxVotes === 0 || !winner) {
    throw new Error("No votes were cast. Start voting again.");
  }

  if (playerIds.length < 3) {
    throw new Error("At least 3 players are required to start the game.");
  }

  const imposterId = playerIds[crypto.randomInt(playerIds.length)];
  const assignedColors = pickPlayerColors(playerIds);
  const templateCode = getSnippetCode(snippet);

  if (!hasUsableCode(templateCode)) {
    throw new Error(`Snippet code is empty for topic "${winner}".`);
  }

  playerIds.forEach((playerId) => {
    room.players[playerId] = {
      ...room.players[playerId],
      role: playerId === imposterId ? "Imposter" : "Player",
      color: assignedColors[playerId],
      alive: room.players[playerId]?.status === "spectating" ? false : true,
      status:
        room.players[playerId]?.status === "spectating"
          ? "spectating"
          : "alive",
    };
  });

  room.gameState = "playing";
  room.roundStartedAt = Date.now();
  room.currentRound = 1;
  room.successfulRounds = 0;
  room.votingdone = true;
  room.votes = {};
  room.winner = winner;
  room.imposterId = imposterId;

  room.codestate = {
    language: snippet.language || "javascript",
    code: hasUsableCode(existingRoomCode) ? existingRoomCode : templateCode,
    updatedAt: Date.now(),
    lockedRanges: normalizeLockedRanges(snippet.lockedRanges),
    playersCursor: {},
    tasks: buildTaskState(snippet),
    templateCode,
  };

  const pipeline = redis.pipeline();

  pipeline.hset(`room:${roomId}`, {
    gameState: room.gameState,
    roundStartedAt: room.roundStartedAt,
    imposterId: room.imposterId,
    winner: room.winner,
    votingdone: room.votingdone,
    currentRound: room.currentRound,
  });

  pipeline.del(`room:${roomId}:votes`);

  playerIds.forEach((playerId) => {
    const p = room.players[playerId];

    pipeline.hset(`room:${roomId}:player:${playerId}`, {
      role: p.role,
      color: p.color,
      alive: p.alive,
      status: p.status,
    });
  });

  pipeline.set(`room:${roomId}:code`, JSON.stringify(room.codestate));

  await pipeline.exec();

  return room;
};

const runCode = async (
  roomId,
  userId,
  reason = "Round timer ended. Review the current code result.",
) => {
  const room = await getRoomState(roomId);

  if (userId) {
    ensureAlivePlayer(room, userId);
  }

  if (room.gameState !== "playing") {
    throw new Error("Code can only be run during gameplay.");
  }

  if (room.codeRunPending) {
    return room;
  }

  room.codeRunPending = true;
  room.codeRunRequestedAt = Date.now();
  room.codeRunReason = reason;

  await redis.hset(`room:${roomId}`, {
    codeRunPending: true,
    codeRunRequestedAt: room.codeRunRequestedAt,
    codeRunReason: room.codeRunReason,
  });

  return room;
};
const resolveCodeRun = async (roomId, userId, snippet, submittedOutput) => {
  const room = await getRoomState(roomId);

  if (userId) {
    ensureAlivePlayer(room, userId);
  }

  if (room.gameState !== "playing") {
    throw new Error("Code results can only be resolved during gameplay.");
  }

  if (!room.codeRunPending) {
    throw new Error("There is no pending code review.");
  }

  const playerTask = getRoleTaskConfig(snippet?.tasks || {}, "player");
  const imposterTask = getRoleTaskConfig(snippet?.tasks || {}, "imposter");

  if (!playerTask || !imposterTask) {
    throw new Error("Expected outputs are missing for one or more roles.");
  }

  const matchesPlayerOutput = compareOutputs(submittedOutput, playerTask);
  const matchesImposterOutput = compareOutputs(submittedOutput, imposterTask);

  room.codeRunPending = false;
  room.codeRunRequestedAt = null;
  room.codeRunReason = null;
  room.meetingStartedAt = null;
  room.meetingVotes = {};
  room.meetingReason = null;

  const pipeline = redis.pipeline();

  pipeline.hset(`room:${roomId}`, {
    codeRunPending: false,
    codeRunRequestedAt: "",
    codeRunReason: "",
  });

  if (matchesPlayerOutput) {
    room.gameState = "crew_win";
    room.winningTeam = "crew";
    room.resultMessage =
      "Crew wins because the output matched the player target.";
    room.gameEndedAt = Date.now();
    room.successfulRounds = (room.successfulRounds || 0) + 1;
    room.roundStartedAt = null;

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      winningTeam: room.winningTeam,
      resultMessage: room.resultMessage,
      gameEndedAt: room.gameEndedAt,
      successfulRounds: room.successfulRounds,
      roundStartedAt: "",
    });

    await pipeline.exec();
    return room;
  }

  if (matchesImposterOutput) {
    room.gameState = "imposter_win";
    room.winningTeam = "imposter";
    room.resultMessage =
      "Imposter wins because the output matched the imposter target.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      winningTeam: room.winningTeam,
      resultMessage: room.resultMessage,
      gameEndedAt: room.gameEndedAt,
      roundStartedAt: "",
    });

    await pipeline.exec();
    return room;
  }

  room.gameState = "meeting";
  room.resultMessage = null;
  room.meetingStartedAt = Date.now();
  room.meetingVotes = {};
  room.meetingReason = "The output did not match any expected result.";

  pipeline.hset(`room:${roomId}`, {
    gameState: room.gameState,
    meetingStartedAt: room.meetingStartedAt,
    meetingReason: room.meetingReason,
    resultMessage: "",
  });

  await pipeline.exec();

  return room;
};

const executeCodeAndResolve = async (roomId, userId, snippet) => {
  const room = await getRoomState(roomId);

  if (!room) {
    throw new Error("Room not found.");
  }

  if (userId) {
    ensureAlivePlayer(room, userId);
  }

  if (room.gameState !== "playing") {
    throw new Error("Code can only be executed during gameplay.");
  }

  if (!room.codeRunPending) {
    throw new Error("There is no pending code review.");
  }

  const code = normalizeStoredCode(room.codestate?.code || "");
  const language = String(room.codestate?.language || "")
    .trim()
    .toLowerCase();

  if (!hasUsableCode(code)) {
    throw new Error("There is no code to execute.");
  }

  if (!SUPPORTED_CODE_LANGUAGES.has(language)) {
    throw new Error("Unsupported language.");
  }

  try {
    const output = await runSubmittedCode({ code, language });

    return await resolveCodeRun(roomId, userId, snippet, output);
  } catch (error) {
    console.error("[CODE_REVIEW] Execution failed:", error.message);

    room.gameState = "meeting";
    room.resultMessage = null;
    room.codeRunPending = false;
    room.codeRunRequestedAt = null;
    room.codeRunReason = null;
    room.meetingStartedAt = Date.now();
    room.meetingVotes = {};
    room.meetingReason = `There was a compilation error while running the code: ${error.message}`;

    const pipeline = redis.pipeline();

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      codeRunPending: false,
      codeRunRequestedAt: "",
      codeRunReason: "",
      meetingStartedAt: room.meetingStartedAt,
      meetingReason: room.meetingReason,
      resultMessage: "",
    });

    await pipeline.exec();

    return room;
  }
};

const startEmergencyMeeting = (
  roomId,
  userId,
  reason = "Emergency code review requested.",
) => {
  return runCode(roomId, userId, reason);
};

const voteInMeeting = async (roomId, userId, targetId) => {
  const room = await getRoomState(roomId);

  ensureAlivePlayer(room, userId);

  if (room.gameState !== "meeting") {
    throw new Error("Meeting voting is not active.");
  }

  const alivePlayerIds = getAlivePlayerIds(room.players || {});
  const normalizedTarget = targetId === "skip" ? "skip" : targetId;

  if (
    normalizedTarget !== "skip" &&
    !alivePlayerIds.includes(normalizedTarget)
  ) {
    throw new Error("Invalid vote target.");
  }

  room.meetingVotes = room.meetingVotes || {};
  room.meetingVotes[userId] = normalizedTarget;

  await redis.hset(`room:${roomId}:meetingVotes`, userId, normalizedTarget);

  return room;
};

const finalizeMeeting = async (roomId, userId) => {
  const room = await getRoomState(roomId);

  if (room.hostId !== userId) {
    throw new Error("Only the host can finish the meeting.");
  }

  ensureRoomPlayer(room, userId);

  if (room.gameState !== "meeting") {
    throw new Error("No meeting is active.");
  }

  const alivePlayerIds = getAlivePlayerIds(room.players || {});
  const resolvedMeetingVotes = { ...(room.meetingVotes || {}) };
  const nextRound = (room.currentRound || 1) + 1;

  alivePlayerIds.forEach((playerId) => {
    if (!resolvedMeetingVotes[playerId]) {
      resolvedMeetingVotes[playerId] = "skip";
    }
  });

  const { highestVoteCount, topTargets } =
    getMeetingVoteSummary(resolvedMeetingVotes);

  let eliminatedPlayerId = null;

  if (
    highestVoteCount > 0 &&
    topTargets.length === 1 &&
    topTargets[0] !== "skip"
  ) {
    eliminatedPlayerId = topTargets[0];
  }

  // 🟢 memory update
  if (eliminatedPlayerId && alivePlayerIds.includes(eliminatedPlayerId)) {
    room.players[eliminatedPlayerId] = {
      ...room.players[eliminatedPlayerId],
      alive: false,
      status: "dead",
    };
  }

  room.meetingVotes = resolvedMeetingVotes;
  room.lastEliminatedId = eliminatedPlayerId;
  room.codeRunPending = false;
  room.codeRunRequestedAt = null;
  room.codeRunReason = null;
  room.meetingStartedAt = null;
  room.meetingReason = null;

  const pipeline = redis.pipeline();

  // ❗ update eliminated player
  if (eliminatedPlayerId) {
    pipeline.hset(`room:${roomId}:player:${eliminatedPlayerId}`, {
      alive: false,
      status: "dead",
    });
  }

  // ❗ clear meeting votes (important)
  pipeline.del(`room:${roomId}:meetingVotes`);

  // --- WIN CONDITIONS ---

  if (eliminatedPlayerId && eliminatedPlayerId === room.imposterId) {
    room.gameState = "crew_win";
    room.winningTeam = "crew";
    room.resultMessage = "Crew wins because the imposter was voted out.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      winningTeam: room.winningTeam,
      resultMessage: room.resultMessage,
      gameEndedAt: room.gameEndedAt,
      roundStartedAt: "",
      lastEliminatedId: eliminatedPlayerId,
    });

    await pipeline.exec();
    return room;
  }

  if (shouldImposterWinByParity(room)) {
    room.gameState = "imposter_win";
    room.winningTeam = "imposter";
    room.resultMessage = "Imposter wins because only 2 players remain.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      winningTeam: room.winningTeam,
      resultMessage: room.resultMessage,
      gameEndedAt: room.gameEndedAt,
      roundStartedAt: "",
    });

    await pipeline.exec();
    return room;
  }

  if (nextRound > TOTAL_GAME_ROUNDS) {
    room.gameState = "draw";
    room.winningTeam = null;
    room.resultMessage =
      "No one won: the crew could not complete the task and the imposter could not sabotage it.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;

    pipeline.hset(`room:${roomId}`, {
      gameState: room.gameState,
      resultMessage: room.resultMessage,
      gameEndedAt: room.gameEndedAt,
      roundStartedAt: "",
    });

    await pipeline.exec();
    return room;
  }

  // 🟢 continue game
  room.gameState = "playing";
  room.winningTeam = null;
  room.resultMessage = null;
  room.roundStartedAt = Date.now();
  room.currentRound = nextRound;

  pipeline.hset(`room:${roomId}`, {
    gameState: room.gameState,
    currentRound: room.currentRound,
    roundStartedAt: room.roundStartedAt,
    lastEliminatedId: eliminatedPlayerId,
  });

  await pipeline.exec();

  return room;
};

const resetRoom = async (roomId, userId) => {
  const room = await getRoomState(roomId);

  if (room.hostId !== userId) {
    throw new Error("Only the host can reset the room.");
  }

  const resetState = buildLobbyResetPayload(room);

  rooms[roomId].state = resetState;

  const pipeline = redis.pipeline();

  pipeline.hset(`room:${roomId}`, {
    gameState: resetState.gameState,
    winner: "",
    winningTeam: "",
    resultMessage: "",
    currentRound: 0,
    successfulRounds: 0,
    codeRunPending: false,
    votingdone: false,
    imposterId: "",
    gameEndedAt: "",
    resetAt: resetState.resetAt,
  });

  pipeline.del(`room:${roomId}:votes`);
  pipeline.del(`room:${roomId}:meetingVotes`);

  pipeline.del(`room:${roomId}:chat`);

  pipeline.del(`room:${roomId}:code`);

  const playerIds = Object.keys(resetState.players || {});
  playerIds.forEach((playerId) => {
    const p = resetState.players[playerId];

    pipeline.hset(`room:${roomId}:player:${playerId}`, {
      status: p.status,
      alive: p.alive,
      role: p.role,
      color: p.color || "",
    });
  });

  await pipeline.exec();

  return resetState;
};
module.exports = {
  executeCodeAndResolve,
  finalizeMeeting,
  finalizeVotingRound,
  resetRoom,
  runCode,
  startEmergencyMeeting,
  startVoting,
  voteInMeeting,
};
