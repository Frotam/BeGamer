const { sendmessage } = require("../../Roomactions/Basicactions");

const createChatHandlers = ({ sendAck, assertRoomAccess, broadcastRoomState }) => {
  const sendChat = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await sendmessage(roomId, ws.userId, data.message);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
  };

  return {
    sendChat,
  };
};

module.exports = {
  createChatHandlers,
};
