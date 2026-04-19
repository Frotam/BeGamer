import { serverTimestamp } from "firebase/database";
import { defaultTopics } from "./constants.js";
import { buildResetPlayers } from "./utils.js";

export const buildInitialRoomData = (user, hostName) => {
  console.log("Building data...");
  return {
    createdAt: Date.now(),
    hostId: user.uid,
    winner: null,
    gameState: "lobby",
    winningTeam: null,
    resultMessage: null,
    gameEndedAt: null,
    resetAt: null,
    emptySince: null,
    roundStartedAt: null,
    votingStartedAt: null,
    currentRound: 0,
    successfulRounds: 0,
    codeRunPending: false,
    codeRunRequestedAt: null,
    codeRunReason: null,
    meetingStartedAt: null,
    meetingVotes: {},
    meetingReason: null,
    lastEliminatedId: null,
    topics: defaultTopics,
    votingdone: false,
    votes: {},
    players: {
      [user.uid]: {
        uid: user.uid,
        name: hostName,
        status: "alive",
        alive: true,
        role: "Player",
        connectedAt: Date.now(),
      },
    },
    chat: {},
    codestate: {
      language: null,
      code: null,
      updatedAt: null,
      lockedRanges: [],
      playersCursor: {},
      tasks: {},
    },
  };
};

export const buildLobbyResetPayload = (room) => {
  return {
    gameState: "lobby",
    winner: null,
    winningTeam: null,
    resultMessage: null,
    roundStartedAt: null,
    votingStartedAt: null,
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
    imposterId: null,
    gameEndedAt: null,
    resetAt: serverTimestamp(),
    emptySince: null,
    players: buildResetPlayers(room?.players || {}),
    chat: {},
    codestate: {
      language: null,
      code: null,
      updatedAt: null,
      lockedRanges: [],
      playersCursor: {},
      tasks: {},
    },
  };
};
