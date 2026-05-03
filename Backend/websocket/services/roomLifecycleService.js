const {
  deleteRoomState,
  persistPlayerState,
  syncRoomStateToRedis,
} = require("../../Roomactions/roomStateStore");

const PLAYER_RECONNECT_GRACE_MS =
  Number(process.env.PLAYER_RECONNECT_GRACE_MS) || 15000;

const createRoomLifecycleService = ({ rooms, yDocs, removePlayer, transferHost }) => {
  const getPendingDisconnects = (roomObj) => {
    if (!roomObj.pendingDisconnects) {
      roomObj.pendingDisconnects = {};
    }

    return roomObj.pendingDisconnects;
  };

  const clearPendingDisconnect = (roomObj, userId) => {
    const pendingDisconnects = getPendingDisconnects(roomObj);
    const pendingDisconnect = pendingDisconnects[userId];

    if (!pendingDisconnect) {
      return false;
    }

    clearTimeout(pendingDisconnect.timer);
    delete pendingDisconnects[userId];
    return true;
  };

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

    const pendingDisconnects = getPendingDisconnects(roomObj);
    Object.values(pendingDisconnects).forEach((entry) => {
      clearTimeout(entry.timer);
    });
    roomObj.pendingDisconnects = {};

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
    if (
      state.gameState === "crew_win" ||
      state.gameState === "imposter_win" ||
      state.gameState === "draw"
    ) {
      return;
    }

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
      state.resultMessage =
        "Game ended in a draw because an alive player left the match.";
      state.gameEndedAt = Date.now();
    }
  };

  const markPlayerDisconnected = async (roomId, roomObj, userId) => {
    const player = roomObj?.state?.players?.[userId];

    if (!player) {
      return;
    }

    roomObj.state.players[userId] = {
      ...player,
      connected: false,
      disconnectedAt: Date.now(),
    };

    await persistPlayerState(roomId, userId, roomObj.state.players[userId], {
      setMembership: true,
      setUserMapping: true,
    });
  };

  const finalizePlayerDisconnect = async (
    roomId,
    roomObj,
    userId,
    broadcastRoomState,
  ) => {
    const activeRoom = rooms[roomId];

    if (!activeRoom || activeRoom !== roomObj) {
      return;
    }

    delete getPendingDisconnects(activeRoom)[userId];

    if (countUserSockets(activeRoom, userId) > 0) {
      return;
    }

    const removedWasAlive = activeRoom.state?.players?.[userId]?.alive !== false;
    await removePlayer(activeRoom, roomId, userId);
    resolveGameOnLeaveIfNeeded(activeRoom, userId, removedWasAlive);
    await ensureHostExists(roomId, activeRoom);

    if (await destroyRoomIfEmpty(roomId, activeRoom)) {
      return;
    }

    await syncRoomStateToRedis(roomId, activeRoom.state);
    broadcastRoomState(roomId);
  };

  const schedulePendingDisconnect = async (
    roomId,
    roomObj,
    userId,
    broadcastRoomState,
  ) => {
    clearPendingDisconnect(roomObj, userId);
    await markPlayerDisconnected(roomId, roomObj, userId);

    getPendingDisconnects(roomObj)[userId] = {
      timer: setTimeout(() => {
        void finalizePlayerDisconnect(roomId, roomObj, userId, broadcastRoomState);
      }, PLAYER_RECONNECT_GRACE_MS),
      startedAt: Date.now(),
    };
  };

  const attachSocketToRoom = (roomId, ws) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      throw new Error("Room not found.");
    }

    if (ws.roomId && ws.roomId !== roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].sockets = rooms[ws.roomId].sockets.filter(
        (client) => client !== ws,
      );
    }

    ws.roomId = roomId;
    clearPendingDisconnect(roomObj, ws.userId);

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

    await schedulePendingDisconnect(roomId, room, userId, broadcastRoomState);
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
