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

    // await updatecode(roomId, roomObj.state.codestate?.code || "", ws.userId);
    Y.applyUpdate(doc, update);
    const fullcode = getFullCodeFromYDoc(roomId);
    await updatecode(roomId, fullcode, ws.userId);

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
  const persistTimers = {};

  function schedulePersist(roomId, doc, userId) {
    clearTimeout(persistTimers[roomId]);

    persistTimers[roomId] = setTimeout(async () => {
      const fullCode = getFullCodeFromYDoc(roomId);
      await updatecode(roomId, fullCode, userId);
    }, 500); // tweak (300–1000ms)
  }
  const updateCode = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);

    const doc = getYDoc(roomId);
    const yText = doc.getText("monaco");

  
    doc.transact(() => {
      yText.delete(0, yText.length);
      if (data.code) {
        yText.insert(0, data.code);
      }
    });


    schedulePersist(roomId, doc, ws.userId);

    
    broadcastYDocState(roomId); 

    sendAck(ws, data.requestId);
  };

  const updateCursor = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await updatecursor(roomId, ws.userId, {
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
