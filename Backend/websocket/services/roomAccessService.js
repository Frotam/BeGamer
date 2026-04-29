const createRoomAccessService = ({ rooms }) => {
  const getRoomObject = (roomId) => {
    const normalizedRoomId = String(roomId || "").trim();

    if (!normalizedRoomId) {
      throw new Error("Room not found.");
    }

    const roomObj = rooms[normalizedRoomId];

    if (!roomObj) {
      throw new Error("Room not found.");
    }

    return { roomId: normalizedRoomId, roomObj };
  };

  const assertRoomAccess = (ws, roomId) => {
    const { roomId: normalizedRoomId, roomObj } = getRoomObject(roomId);
    const userId = String(ws?.userId || "").trim();

    if (!userId) {
      throw new Error("Unauthorized access.");
    }

    if (!roomObj.state?.players?.[userId]) {
      throw new Error("Unauthorized access.");
    }

    if (ws.roomId && ws.roomId !== normalizedRoomId) {
      throw new Error("Unauthorized access.");
    }

    return { roomId: normalizedRoomId, roomObj };
  };

  return {
    assertRoomAccess,
    getRoomObject,
  };
};

module.exports = {
  createRoomAccessService,
};
