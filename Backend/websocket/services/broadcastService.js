const createBroadcastService = ({ rooms, getYDoc, Y, send }) => {
  const broadcast = (roomId, payload) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      return;
    }

    roomObj.sockets.forEach((client) => {
      send(client, payload);
    });
  };

  const broadcastRoomState = (roomId) => {
    const roomObj = rooms[roomId];

    if (!roomObj) {
      return;
    }

    broadcast(roomId, {
      type: "roomState",
      state: roomObj.state,
    });
  };

  const broadcastYDocState = (roomId) => {
    const doc = getYDoc(roomId);
    const state = Y.encodeStateAsUpdate(doc);

    broadcast(roomId, {
      type: "yjs-init",
      roomId,
      update: Array.from(state),
    });
  };

  return {
    broadcast,
    broadcastRoomState,
    broadcastYDocState,
  };
};

module.exports = {
  createBroadcastService,
};
