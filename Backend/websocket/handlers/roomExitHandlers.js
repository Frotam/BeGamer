const { rooms } = require("../../roomsStore");

const createRoomExitHandlers = ({
  sendAck,
  countUserSockets,
  removePlayer,
  resolveGameOnLeaveIfNeeded,
  ensureHostExists,
  destroyRoomIfEmpty,
  broadcastRoomState,
}) => {
  const leaveRoom = async (ws, data) => {
    const roomId = String(data.roomId || "").trim();
    const roomObj = rooms[roomId];

    if (!roomId || !roomObj) {
      sendAck(ws, data.requestId);
      return;
    }

    if (!ws.userId || !roomObj.state?.players?.[ws.userId]) {
      sendAck(ws, data.requestId);
      return;
    }

    const userId = ws.userId;

    roomObj.sockets = roomObj.sockets.filter((client) => client !== ws);
    ws.roomId = null;

    const hasActiveConnection = countUserSockets(roomObj, userId) > 0;

    if (!hasActiveConnection) {
      const removedWasAlive = roomObj.state?.players?.[userId]?.alive !== false;
      removePlayer(roomObj, userId);
      resolveGameOnLeaveIfNeeded(roomObj, userId, removedWasAlive);
      ensureHostExists(roomObj);

      if (destroyRoomIfEmpty(roomId, roomObj)) {
        sendAck(ws, data.requestId);
        return;
      }

      broadcastRoomState(roomId);
    }

    sendAck(ws, data.requestId);
  };

  return {
    leaveRoom,
  };
};

module.exports = {
  createRoomExitHandlers,
};
