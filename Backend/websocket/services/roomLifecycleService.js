const {
  deleteRoomState,
  syncRoomStateToRedis,
} = require("../../Roomactions/roomStateStore");

const createRoomLifecycleService = ({ rooms, yDocs, removePlayer, transferHost }) => {
  const countUserSockets = (roomObj, userId) => {
    if (!roomObj || !userId) return 0;

    return (roomObj.sockets || []).filter(
      (client) => client && client.readyState === 1 && client.userId === userId,
    ).length;
  };

  const ensureHostExists = async (roomId, roomObj) => {
    if (!roomObj?.state) return;
    const hostId = roomObj.state.hostId;
    if (hostId && roomObj.state.players?.[hostId]) return;
    await transferHost(roomObj, roomId);
  };

  const destroyRoomIfEmpty = async (roomId, roomObj) => {
    const playerCount = Object.keys(roomObj?.state?.players || {}).length;
    if (playerCount > 0) return false;

    if (roomObj.cleanupTimer) {
      clearTimeout(roomObj.cleanupTimer);
      roomObj.cleanupTimer = null;
    }

    const playerIds = Object.keys(roomObj?.state?.players || {});
    await deleteRoomState(roomId, playerIds);
    delete rooms[roomId];
    delete yDocs[roomId];
    return true;
  };

  const resolveGameOnLeaveIfNeeded = (roomObj, removedUserId, removedWasAlive) => {
    const state = roomObj?.state;
    if (!state || !removedUserId) return;
    if (state.gameState !== "playing" && state.gameState !== "meeting") return;
    if (state.gameState === "crew_win" || state.gameState === "imposter_win" || state.gameState === "draw") return;

    if (state.imposterId === removedUserId) {
      state.gameState = "crew_win";
      state.winningTeam = "crew";
      state.resultMessage = "Crew wins because the imposter left the match.";
      state.gameEndedAt = Date.now();
      return;
    }

    if (removedWasAlive) {
      state.gameState = "draw";
      state.winningTeam = null;
      state.resultMessage = "Game ended in a draw because an alive player left the match.";
      state.gameEndedAt = Date.now();
    }
  };

  const attachSocketToRoom = (roomId, ws) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      throw new Error("Room not found.");
    }

    if (ws.roomId && ws.roomId !== roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].sockets = rooms[ws.roomId].sockets.filter((client) => client !== ws);
    }

    ws.roomId = roomId;

    if (!roomObj.sockets.includes(ws)) {
      roomObj.sockets.push(ws);
    }
  };

  const cleanupUserOnClose = async (ws, broadcastRoomState) => {
    const roomId = ws.roomId;
    const room = rooms[roomId];
    if (!roomId || !room) return;

    const userId = ws.userId || ws.user?.uid;
    if (!userId) return;

    room.sockets = room.sockets.filter((c) => c !== ws);

    const hasActiveConnection = countUserSockets(room, userId) > 0;
    if (hasActiveConnection) return;

    const removedWasAlive = room.state?.players?.[userId]?.alive !== false;
    await removePlayer(room, roomId, userId);
    resolveGameOnLeaveIfNeeded(room, userId, removedWasAlive);
    await ensureHostExists(roomId, room);

    if (await destroyRoomIfEmpty(roomId, room)) {
      return;
    }

    await syncRoomStateToRedis(roomId, room.state);
    broadcastRoomState(roomId);
  };

  return {
    attachSocketToRoom,
    cleanupUserOnClose,
    countUserSockets,
    destroyRoomIfEmpty,
    ensureHostExists,
    resolveGameOnLeaveIfNeeded,
  };
};

module.exports = {
  createRoomLifecycleService,
};
