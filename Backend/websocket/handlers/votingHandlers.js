const { voteForTopic } = require("../../Roomactions/Basicactions");
const {
  finalizeVotingRound,
  resetRoom,
  startVoting,
} = require("../../Roomactions/gameActions");
const { fetchSnippetFromFirebase } = require("../../Roomactions/firebasefunctions");

const createVotingHandlers = ({
  sendAck,
  assertRoomAccess,
  replaceYDocTextFromRoom,
  broadcastRoomState,
  broadcastYDocState,
}) => {
  const startVotingHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await startVoting(roomId, ws.userId);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
  };

  const voteHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await voteForTopic(roomId, ws.userId, data.topicId);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
  };

  const resetRoomHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await resetRoom(roomId, ws.userId);
    replaceYDocTextFromRoom(roomId);
    broadcastRoomState(roomId);
    broadcastYDocState(roomId);
    sendAck(ws, data.requestId);
  };

  const finalizeVotingHandler = async (ws, data) => {
    const { roomId, roomObj } = assertRoomAccess(ws, data.roomId);
    const winner = roomObj?.state?.winner || null;
    const resolvedWinner = winner || Object.values(roomObj?.state?.votes || {}).find(Boolean);

    if (!resolvedWinner) {
      throw new Error("No winning topic was found.");
    }

    const snippet = await fetchSnippetFromFirebase(resolvedWinner);
    await finalizeVotingRound(roomId, ws.userId, snippet);
    replaceYDocTextFromRoom(roomId);
    broadcastRoomState(roomId);
    broadcastYDocState(roomId);
    sendAck(ws, data.requestId);
  };

  return {
    startVoting: startVotingHandler,
    vote: voteHandler,
    resetRoom: resetRoomHandler,
    finalizeVoting: finalizeVotingHandler,
  };
};

module.exports = {
  createVotingHandlers,
};
