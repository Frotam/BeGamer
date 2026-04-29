const crypto = require("crypto");
const { rooms } = require("../roomsStore");
const { buildLobbyResetPayload } = require("./payload");
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

const TOTAL_GAME_ROUNDS = 3;
const SUPPORTED_CODE_LANGUAGES = new Set(["cpp", "javascript", "python"]);

const getRoomState = (roomId) => {
  const roomObj = rooms[roomId];

  if (!roomObj) {
    throw new Error("Room not found.");
  }

  return roomObj.state;
};

const buildTaskState = (snippet) => {
  const playerTask = sanitizeRoleTaskConfig(getRoleTaskConfig(snippet?.tasks || {}, "player"));
  const imposterTask = sanitizeRoleTaskConfig(getRoleTaskConfig(snippet?.tasks || {}, "imposter"));

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
  console.log(`[CODE_REVIEW] Running ${language} code (${Buffer.byteLength(code, "utf8")} bytes)`);
  //  throw new Error("test error")

  const response = await fetch(`http://127.0.0.1:${port}/run-code`, {
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

  console.log(`[CODE_REVIEW] Output: ${JSON.stringify(String(payload.output || ""))}`);
  return String(payload.output || "");
};

const startVoting = (roomId, userId) => {
  const room = getRoomState(roomId);
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

  return room;
};

const finalizeVotingRound = (roomId, userId, snippet) => {
  const room = getRoomState(roomId);

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
      status: room.players[playerId]?.status === "spectating" ? "spectating" : "alive",
    };
  });

  room.gameState = "playing";
  room.winningTeam = null;
  room.resultMessage = null;
  room.gameEndedAt = null;
  room.resetAt = null;
  room.roundStartedAt = Date.now();
  room.currentRound = 1;
  room.successfulRounds = 0;
  room.codeRunPending = false;
  room.codeRunRequestedAt = null;
  room.codeRunReason = null;
  room.meetingStartedAt = null;
  room.meetingVotes = {};
  room.meetingReason = null;
  room.lastEliminatedId = null;
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

  return room;
};

const runCode = (roomId, userId, reason = "Round timer ended. Review the current code result.") => {
  const room = getRoomState(roomId);

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
  return room;
};

const resolveCodeRun = (roomId, userId, snippet, submittedOutput) => {
  const room = getRoomState(roomId);

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

  if (matchesPlayerOutput) {
    room.gameState = "crew_win";
    room.winningTeam = "crew";
    room.resultMessage = "Crew wins because the output matched the player target.";
    room.gameEndedAt = Date.now();
    room.successfulRounds = (room.successfulRounds || 0) + 1;
    room.roundStartedAt = null;
    return room;
  }

  if (matchesImposterOutput) {
    room.gameState = "imposter_win";
    room.winningTeam = "imposter";
    room.resultMessage = "Imposter wins because the output matched the imposter target.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;
    return room;
  }

  room.gameState = "meeting";
  room.resultMessage = null;
  room.meetingStartedAt = Date.now();
  room.meetingVotes = {};
  room.meetingReason = "The output did not match any expected result.";
  return room;
};

const executeCodeAndResolve = async (roomId, userId, snippet) => {
  const room = getRoomState(roomId);

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
  const language = String(room.codestate?.language || "").trim().toLowerCase();

  if (!hasUsableCode(code)) {
    throw new Error("There is no code to execute.");
  }

  if (!SUPPORTED_CODE_LANGUAGES.has(language)) {
    throw new Error("Unsupported language.");
  }

  try {
    const output = await runSubmittedCode({ code, language });
    return resolveCodeRun(roomId, userId, snippet, output);
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
    return room;
  }
};

const startEmergencyMeeting = (roomId, userId, reason = "Emergency code review requested.") => {
  return runCode(roomId, userId, reason);
};

const voteInMeeting = (roomId, userId, targetId) => {
  const room = getRoomState(roomId);

  ensureAlivePlayer(room, userId);

  if (room.gameState !== "meeting") {
    throw new Error("Meeting voting is not active.");
  }

  const alivePlayerIds = getAlivePlayerIds(room.players || {});
  const normalizedTarget = targetId === "skip" ? "skip" : targetId;

  if (normalizedTarget !== "skip" && !alivePlayerIds.includes(normalizedTarget)) {
    throw new Error("Invalid vote target.");
  }

  room.meetingVotes[userId] = normalizedTarget;
  return room;
};

const finalizeMeeting = (roomId, userId) => {
  const room = getRoomState(roomId);

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

  const { highestVoteCount, topTargets } = getMeetingVoteSummary(resolvedMeetingVotes);

  let eliminatedPlayerId = null;

  if (highestVoteCount > 0 && topTargets.length === 1 && topTargets[0] !== "skip") {
    eliminatedPlayerId = topTargets[0];
  }

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

  if (eliminatedPlayerId && eliminatedPlayerId === room.imposterId) {
    room.gameState = "crew_win";
    room.winningTeam = "crew";
    room.resultMessage = "Crew wins because the imposter was voted out.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;
    return room;
  }

  if (shouldImposterWinByParity(room)) {
    room.gameState = "imposter_win";
    room.winningTeam = "imposter";
    room.resultMessage = "Imposter wins because only 2 players remain.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;
    return room;
  }

  if (nextRound > TOTAL_GAME_ROUNDS) {
    room.gameState = "draw";
    room.winningTeam = null;
    room.resultMessage =
      "No one won: the crew could not complete the task and the imposter could not sabotage it.";
    room.gameEndedAt = Date.now();
    room.roundStartedAt = null;
    return room;
  }

  room.gameState = "playing";
  room.winningTeam = null;
  room.resultMessage = null;
  room.roundStartedAt = Date.now();
  room.currentRound = nextRound;
  return room;
};

const resetRoom = (roomId, userId) => {
  const room = getRoomState(roomId);

  if (room.hostId !== userId) {
    throw new Error("Only the host can reset the room.");
  }

  const resetState = buildLobbyResetPayload(room);
  rooms[roomId].state = resetState;
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
