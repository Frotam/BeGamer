const { buildResetPlayers } = require("./utils");

const defaultTopics = {
  "backend(Js)": { label: "Backend (Js)" },
  "dsa(Cpp)": { label: "DSA (Cpp)" },
  "dsa(Py)": { label: "DSA (Py)" },
};

const buildInitialRoomData = (userId, hostName) => {
  return {
    createdAt: Date.now(),
    hostId: userId,
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
      [userId]: {
        uid: userId,
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

const buildLobbyResetPayload = (room) => {
  return {
    ...room,
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
    resetAt: Date.now(),
    emptySince: null,
    players: buildResetPlayers(room.players || {}),
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

module.exports = {
  buildInitialRoomData,
  buildLobbyResetPayload,
};
