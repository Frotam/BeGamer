import { get, ref, serverTimestamp, update } from "firebase/database";
import { buildLobbyResetPayload } from "./payloads.js";
import { TOTAL_GAME_ROUNDS } from "./constants.js";
import { getRoomRef, getRoomSnapshot, getSnippetRef } from "./refs.js";
import {
  compareOutputs,
  ensureAlivePlayer,
  getAlivePlayerIds,
  getAssignedPlayerCount,
  getExpectedOutputLines,
  getMeetingVoteSummary,
  getRoleTaskConfig,
  getSnippetCode,
  getWinningTopic,
  hasUsableCode,
  normalizeLockedRanges,
  normalizeStoredCode,
  shouldImposterWinByParity,
} from "./utils.js";

const PLAYER_COLORS = [
  "#f97316",
  "#14b8a6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#0f766e",
  "#7c3aed",
];

const CODE_RUN_REQUEST_TIMEOUT_MS = 15000;
const SUPPORTED_CODE_LANGUAGES = new Set(["cpp", "javascript", "python"]);

const getBackendUrl = (fallbackUrl = "http://localhost:5000") => {
  return import.meta.env.VITE_BACKEND_URL || fallbackUrl;
};

const parseCodeRunResponse = async (response) => {
  let result = null;

  try {
    result = await response.json();
  } catch {
    throw new Error("Code runner returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(result?.error || `Code runner failed with status ${response.status}.`);
  }

  return result;
};

const runSubmittedCode = async ({ code, language }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, CODE_RUN_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getBackendUrl("http://localhost:5001")}/run-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        language,
      }),
      signal: controller.signal,
    });

    const result = await parseCodeRunResponse(response);

    if (!result.success) {
      throw new Error(result.error || "Compilation failed");
    }

    return String(result.output || "");
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Code runner timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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

export const createGameActions = ({ database, getRequiredUser }) => {
  const actions = {
  startVoting: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();
    const totalPlayers = Object.keys(room.players || {}).length;

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can start voting.");
    }

    if (totalPlayers < 3) {
      throw new Error("At least 3 players are required to start voting.");
    }

    return update(getRoomRef(database, roomId), {
      gameState: "voting",
      winningTeam: null,
      resultMessage: null,
      gameEndedAt: null,
      resetAt: null,
      votingStartedAt: serverTimestamp(),
      roundStartedAt: null,
      currentRound: 0,
      successfulRounds: 0,
      codeRunPending: false,
      codeRunRequestedAt: null,
      codeRunReason: null,
      meetingStartedAt: null,
      meetingVotes: {},
      meetingReason: null,
      lastEliminatedId: null,
      votingdone: false,
      votes: {},
      winner: null,
    });
  },

  updatestate: async (roomId) => {
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();
    const playerIds = Object.keys(room.players || {});
    const assignedColors = pickPlayerColors(playerIds);
    const updatedPlayers = { ...(room.players || {}) };

    playerIds.forEach((playerId) => {
      updatedPlayers[playerId] = {
        ...updatedPlayers[playerId],
        color: assignedColors[playerId],
      };
    });

    return update(getRoomRef(database, roomId), {
      gameState: "playing",
      players: updatedPlayers,
      "codestate/playersCursor": {},
    });
  },

  setwinnner: (roomId, winner) => {
    return update(getRoomRef(database, roomId), {
      winner,
    });
  },

  votingdone: (roomId) => {
    return update(getRoomRef(database, roomId), {
      votingdone: true,
    });
  },

  finalizeVotingRound: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
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

    // SECURITY FIX: Use server-side imposter selection instead of client-side random
    // This prevents players from manipulating their role assignment
    let imposterId;
    try {
      const imposterResponse = await fetch(`${getBackendUrl()}/select-imposter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds })
      });

      if (!imposterResponse.ok) {
        throw new Error(`Backend returned ${imposterResponse.status}`);
      }

      const imposterData = await imposterResponse.json();
      if (!imposterData.success || !imposterData.imposterId) {
        throw new Error("Failed to get imposter selection from server");
      }

      imposterId = imposterData.imposterId;
      ("[SECURITY] Imposter selected by backend:", imposterId);
    } catch (error) {
      console.error("[SECURITY] Failed to get imposter from backend, using secure fallback:", error);
      // Fallback to secure client-side selection if backend is unavailable
      // Using crypto.getRandomValues for better randomness
      const randomArray = new Uint32Array(1);
      crypto.getRandomValues(randomArray);
      const randomIndex = randomArray[0] % playerIds.length;
      imposterId = playerIds[randomIndex];
    }

    const assignedColors = pickPlayerColors(playerIds);
    const playerRoleAndColorUpdates = {};
    let codestateUpdates = {
      "codestate/tasks": {},
    };

    playerIds.forEach((playerId) => {
      playerRoleAndColorUpdates[`players/${playerId}/role`] =
        playerId === imposterId ? "Imposter" : "Player";
      playerRoleAndColorUpdates[`players/${playerId}/color`] =
        assignedColors[playerId];
    });

    if (!hasUsableCode(existingRoomCode)) {
      const snippetSnap = await get(getSnippetRef(database, winner));

      if (!snippetSnap.exists()) {
        throw new Error(`No code snippet found for topic "${winner}".`);
      }

      const snippet = snippetSnap.val();
      const normalizedSnippetCode = getSnippetCode(snippet);

      if (!hasUsableCode(normalizedSnippetCode)) {
        throw new Error(`Snippet code is empty for topic "${winner}".`);
      }

      codestateUpdates = {
        "codestate/language": snippet.language || "javascript",
        "codestate/code": hasUsableCode(existingRoomCode)
          ? existingRoomCode
          : normalizedSnippetCode,
        "codestate/updatedAt": Date.now(),
        "codestate/lockedRanges": normalizeLockedRanges(snippet.lockedRanges),
        "codestate/tasks": {},
      };
    }

    return update(getRoomRef(database, roomId), {
      gameState: "playing",
      winningTeam: null,
      resultMessage: null,
      gameEndedAt: null,
      resetAt: null,
      roundStartedAt: serverTimestamp(),
      currentRound: 1,
      successfulRounds: 0,
      codeRunPending: false,
      codeRunRequestedAt: null,
      codeRunReason: null,
      meetingStartedAt: null,
      meetingVotes: {},
      meetingReason: null,
      lastEliminatedId: null,
      votingdone: true,
      winner,
      imposterId,
      "codestate/playersCursor": {},
      ...playerRoleAndColorUpdates,
      ...codestateUpdates,
    });
  },

  runCode: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can run the code.");
    }

    ensureAlivePlayer(room, user);

    if (room.gameState !== "playing") {
      throw new Error("Code can only be run during gameplay.");
    }

    return update(getRoomRef(database, roomId), {
      codeRunPending: true,
      codeRunRequestedAt: serverTimestamp(),
      codeRunReason: "Round timer ended. Review the current code result.",
    });
  },

  executeCodeAndResolve: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (!room) {
      throw new Error("Room not found.");
    }

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can execute and resolve the code run.");
    }

    ensureAlivePlayer(room, user);

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

    let output = "";

    try {
      output = await runSubmittedCode({
        code,
        language,
      });
    } catch {
      return update(getRoomRef(database, roomId), {
        gameState: "meeting",
        resultMessage: null,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        meetingStartedAt: serverTimestamp(),
        meetingVotes: {},
        meetingReason: "There was a compilation error while running the code.",
      });
    }

    return actions.resolveCodeRun(roomId, output);
  },

  startEmergencyMeeting: async (
    roomId,
    reason = "Emergency code review requested."
  ) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    ensureAlivePlayer(room, user);

    if (room.gameState !== "playing") {
      throw new Error("Emergency meetings can only start during gameplay.");
    }

    return update(getRoomRef(database, roomId), {
      codeRunPending: true,
      codeRunRequestedAt: serverTimestamp(),
      codeRunReason: reason,
    });
  },

  resolveCodeRun: async (roomId, submittedOutput) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();


    if (room.hostId !== user.uid) {
      throw new Error("Only the host can resolve the code run.");
    }

    ensureAlivePlayer(room, user);

    if (room.gameState !== "playing") {
      throw new Error("Code results can only be resolved during gameplay.");
    }

    if (!room.codeRunPending) {
      throw new Error("There is no pending code review.");
    }

    const snippetSnap = await get(getSnippetRef(database, room.winner));

    if (!snippetSnap.exists()) {
      throw new Error(`No code snippet found for topic "${room.winner}".`);
    }

    const snippet = snippetSnap.val();
    const playerTask =getRoleTaskConfig(snippet.tasks || {}, "player");
  const imposterTask =getRoleTaskConfig(snippet.tasks || {}, "imposter");

    const hasPlayerExpectedOutput = getExpectedOutputLines(playerTask).length > 0;
    const hasImposterExpectedOutput = getExpectedOutputLines(imposterTask).length > 0;
(submittedOutput,playerTask.expectedOutput,imposterTask.expectedOutput);
    if (!hasPlayerExpectedOutput || !hasImposterExpectedOutput) {
      throw new Error("Expected outputs are missing for one or more roles.");
    }

    const matchesPlayerOutput = compareOutputs(submittedOutput, playerTask);
    const matchesImposterOutput = compareOutputs(submittedOutput, imposterTask);

    if (matchesPlayerOutput) {
      return update(getRoomRef(database, roomId), {
        gameState: "crew_win",
        winningTeam: "crew",
        resultMessage: "Crew wins because the output matched the player target.",
        gameEndedAt: serverTimestamp(),
        successfulRounds: (room.successfulRounds || 0) + 1,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        roundStartedAt: null,
        meetingStartedAt: null,
        meetingVotes: {},
        meetingReason: null,
      });
    }

    if (matchesImposterOutput) {
      return update(getRoomRef(database, roomId), {
        gameState: "imposter_win",
        winningTeam: "imposter",
        resultMessage: "Imposter wins because the output matched the imposter target.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        roundStartedAt: null,
        meetingStartedAt: null,
        meetingVotes: {},
        meetingReason: null,
      });
    }

    return update(getRoomRef(database, roomId), {
      gameState: "meeting",
      resultMessage: null,
      codeRunPending: false,
      codeRunRequestedAt: null,
      codeRunReason: null,
      meetingStartedAt: serverTimestamp(),
      meetingVotes: {},
      meetingReason: "The output did not match any expected result.",
    });
  },

  reportSabotage: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can report sabotage.");
    }

    ensureAlivePlayer(room, user);

    return update(getRoomRef(database, roomId), {
      gameState: "meeting",
      resultMessage: null,
      codeRunPending: false,
      codeRunRequestedAt: null,
      codeRunReason: null,
      meetingStartedAt: serverTimestamp(),
      meetingVotes: {},
      meetingReason: "There was sabotage in the last code run.",
    });
  },

  voteInMeeting: async (roomId, targetId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    ensureAlivePlayer(room, user);

    if (room.gameState !== "meeting") {
      throw new Error("Meeting voting is not active.");
    }

    const alivePlayerIds = getAlivePlayerIds(room.players || {});
    const normalizedTarget = targetId === "skip" ? "skip" : targetId;

    if (normalizedTarget !== "skip" && !alivePlayerIds.includes(normalizedTarget)) {
      throw new Error("Invalid vote target.");
    }

    return update(ref(database, `rooms/${roomId}/meetingVotes`), {
      [user.uid]: normalizedTarget,
    });
  },

  finalizeMeeting: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can finish the meeting.");
    }

    ensureAlivePlayer(room, user);

    if (room.gameState !== "meeting") {
      throw new Error("No meeting is active.");
    }

    const alivePlayerIds = getAlivePlayerIds(room.players || {});
    const resolvedMeetingVotes = { ...(room.meetingVotes || {}) };
    const updatedPlayers = { ...(room.players || {}) };
    const playerStatusUpdates = {};
    const nextRound = (room.currentRound || 1) + 1;

    alivePlayerIds.forEach((playerId) => {
      if (!resolvedMeetingVotes[playerId]) {
        resolvedMeetingVotes[playerId] = "skip";
      }
    });

    const { highestVoteCount, topTargets } = getMeetingVoteSummary(
      resolvedMeetingVotes
    );

    let eliminatedPlayerId = null;

    if (
      highestVoteCount > 0 &&
      topTargets.length === 1 &&
      topTargets[0] !== "skip"
    ) {
      eliminatedPlayerId = topTargets[0];
    }

    if (eliminatedPlayerId && alivePlayerIds.includes(eliminatedPlayerId)) {
      updatedPlayers[eliminatedPlayerId] = {
        ...updatedPlayers[eliminatedPlayerId],
        alive: false,
        status: "dead",
      };
      playerStatusUpdates[`players/${eliminatedPlayerId}/alive`] = false;
      playerStatusUpdates[`players/${eliminatedPlayerId}/status`] = "dead";
    }

    if (eliminatedPlayerId && eliminatedPlayerId === room.imposterId) {
      return update(getRoomRef(database, roomId), {
        gameState: "crew_win",
        winningTeam: "crew",
        resultMessage: "Crew wins because the imposter was voted out.",
        gameEndedAt: serverTimestamp(),
        roundStartedAt: null,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        meetingStartedAt: null,
        meetingVotes: resolvedMeetingVotes,
        meetingReason: null,
        lastEliminatedId: eliminatedPlayerId,
        ...playerStatusUpdates,
      });
    }

    const parityRoomState = {
      ...room,
      players: updatedPlayers,
    };

    if (shouldImposterWinByParity(parityRoomState)) {
      return update(getRoomRef(database, roomId), {
        gameState: "imposter_win",
        winningTeam: "imposter",
        resultMessage: "Imposter wins because only 2 players remain.",
        gameEndedAt: serverTimestamp(),
        roundStartedAt: null,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        meetingStartedAt: null,
        meetingVotes: resolvedMeetingVotes,
        meetingReason: null,
        lastEliminatedId: eliminatedPlayerId,
        ...playerStatusUpdates,
      });
    }

    if (nextRound > TOTAL_GAME_ROUNDS) {
      return update(getRoomRef(database, roomId), {
        gameState: "draw",
        winningTeam: null,
        resultMessage:
          "No one won: the crew could not complete the task and the imposter could not sabotage it.",
        gameEndedAt: serverTimestamp(),
        roundStartedAt: null,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        meetingStartedAt: null,
        meetingVotes: resolvedMeetingVotes,
        meetingReason: null,
        lastEliminatedId: eliminatedPlayerId,
        ...playerStatusUpdates,
      });
    }

    return update(getRoomRef(database, roomId), {
      gameState: "playing",
      winningTeam: null,
      resultMessage: null,
      roundStartedAt: serverTimestamp(),
      currentRound: nextRound,
      codeRunPending: false,
      codeRunRequestedAt: null,
      codeRunReason: null,
      meetingStartedAt: null,
      meetingVotes: resolvedMeetingVotes,
      meetingReason: null,
      lastEliminatedId: eliminatedPlayerId,
      ...playerStatusUpdates,
    });
  },

  syncRoomState: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
      return;
    }

    const playerEntries = Object.entries(room.players || {});
    const activePlayerCount = playerEntries.length;
    const assignedPlayerCount = getAssignedPlayerCount(room);
    const imposterStillPresent = room.imposterId
      ? Boolean(room.players?.[room.imposterId])
      : true;
    const isGameInProgress =
      room.gameState === "voting" ||
      room.gameState === "playing" ||
      room.gameState === "meeting";

    if (room.gameState === "insufficient" && activePlayerCount >= 2) {
      await update(getRoomRef(database, roomId), {
        gameState: "lobby",
        winningTeam: null,
        resultMessage: null,
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
      });
      return;
    }

    if (
      isGameInProgress &&
      activePlayerCount < 2 &&
      room.gameState !== "insufficient"
    ) {
      await update(getRoomRef(database, roomId), {
        gameState: "insufficient",
        winningTeam: null,
        resultMessage: "Insufficient players to continue the game.",
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
      });
      return;
    }

    if (
      room.imposterId &&
      assignedPlayerCount >= 3 &&
      activePlayerCount < assignedPlayerCount &&
      room.gameState !== "lobby" &&
      room.gameState !== "voting" &&
      room.gameState !== "crew_win" &&
      room.gameState !== "imposter_win"
    ) {
      await update(getRoomRef(database, roomId), {
        gameState: imposterStillPresent ? "imposter_win" : "crew_win",
        winningTeam: imposterStillPresent ? "imposter" : "crew",
        resultMessage: imposterStillPresent
          ? "Imposter wins because a crew member left the match."
          : "Crew wins because the imposter left the match.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        roundStartedAt: null,
        meetingStartedAt: null,
        meetingReason: null,
      });
      return;
    }

    if (
      room.imposterId &&
      room.gameState !== "lobby" &&
      room.gameState !== "voting" &&
      room.gameState !== "crew_win" &&
      room.gameState !== "imposter_win" &&
      shouldImposterWinByParity(room)
    ) {
      await update(getRoomRef(database, roomId), {
        gameState: "imposter_win",
        winningTeam: "imposter",
        resultMessage: "Imposter wins because only 2 players remain.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
        roundStartedAt: null,
        meetingStartedAt: null,
        meetingReason: null,
      });
      return;
    }

    if (room.gameState === "voting" && activePlayerCount < 3) {
      await update(getRoomRef(database, roomId), {
        gameState: "crew_win",
        winningTeam: "crew",
        resultMessage: "Crew wins because players dropped below 3 during voting.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
      });
      return;
    }

    if (
      room.imposterId &&
      room.gameState !== "lobby" &&
      room.gameState !== "voting" &&
      room.gameState !== "crew_win" &&
      room.gameState !== "imposter_win" &&
      !imposterStillPresent
    ) {
      await update(getRoomRef(database, roomId), {
        gameState: "crew_win",
        winningTeam: "crew",
        resultMessage: "Crew wins because the imposter left the game.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
      });
      return;
    }

    if (
      room.imposterId &&
      room.players?.[room.imposterId]?.alive === false &&
      room.gameState !== "crew_win" &&
      room.gameState !== "imposter_win"
    ) {
      await update(getRoomRef(database, roomId), {
        gameState: "crew_win",
        winningTeam: "crew",
        resultMessage: "Crew wins because the imposter was eliminated.",
        gameEndedAt: serverTimestamp(),
        codeRunPending: false,
        codeRunRequestedAt: null,
        codeRunReason: null,
      });
    }
  },

  resetRoomForReplay: async (roomId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    if (room.hostId !== user.uid) {
      throw new Error("Only the host can reset the room.");
    }

    return update(getRoomRef(database, roomId), buildLobbyResetPayload(room));
  },
  };

  return actions;
};
