const { updatecode, updatecursor } = require("../../Roomactions/Basicactions");

const createEditorHandlers = ({
  sendAck,
  assertRoomAccess,
  getYDoc,
  getFullCodeFromYDoc,
  replaceYDocTextFromRoom,
  broadcast,
  broadcastRoomState,
  broadcastYDocState,
  Y,
}) => {
  const yjsUpdate = async (ws, data) => {
    const { roomId, roomObj } = assertRoomAccess(ws, data.roomId);
    const doc = getYDoc(roomId);
    const update = Uint8Array.from(data.update);

    updatecode(roomId, roomObj.state.codestate?.code || "", ws.userId);
    Y.applyUpdate(doc, update);
    updatecode(roomId, getFullCodeFromYDoc(roomId), ws.userId);

    roomObj.sockets.forEach((client) => {
      if (client !== ws && client.readyState === 1) {
        client.send(
          JSON.stringify({
            type: "yjs-update",
            roomId,
            update: data.update,
          }),
        );
      }
    });
  };

  const updateCode = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    updatecode(roomId, data.code, ws.userId);
    replaceYDocTextFromRoom(roomId);

    broadcastRoomState(roomId);
    broadcastYDocState(roomId);
    sendAck(ws, data.requestId);
  };

  const updateCursor = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    updatecursor(roomId, ws.userId, {
      line: data.line,
      column: data.column,
    });

    broadcast(roomId, {
      type: "cursorUpdate",
      userId: ws.userId,
      line: data.line,
      column: data.column,
    });

    sendAck(ws, data.requestId);
  };

  return {
    "yjs-update": yjsUpdate,
    Updatecode: updateCode,
    updateCursor,
  };
};

module.exports = {
  createEditorHandlers,
};
