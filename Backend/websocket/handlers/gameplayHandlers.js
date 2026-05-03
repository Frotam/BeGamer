const {
  finalizeMeeting,
  runCode,
  startEmergencyMeeting,
  voteInMeeting,
} = require("../../Roomactions/gameActions");

const createGameplayHandlers = ({
  sendAck,
  assertRoomAccess,
  persistSubmittedCodeForRun,
  persistRoomCodeFromYDoc,
  broadcastRoomState,
  broadcastYDocState,
  runServerCodeReview,
}) => {
  const runCodeHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await persistSubmittedCodeForRun(roomId, data.code);
    await runCode(roomId, ws.userId);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
    void runServerCodeReview(roomId);
  };

  const executeCodeAndResolveHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await persistSubmittedCodeForRun(roomId, data.code);
    void runServerCodeReview(roomId);
    sendAck(ws, data.requestId);
  };

  const startEmergencyMeetingHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await persistSubmittedCodeForRun(roomId, data.code);
    await startEmergencyMeeting(roomId, ws.userId, data.reason);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
    void runServerCodeReview(roomId);
  };

  const voteInMeetingHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await voteInMeeting(roomId, ws.userId, data.targetId);
    broadcastRoomState(roomId);
    sendAck(ws, data.requestId);
  };

  const finalizeMeetingHandler = async (ws, data) => {
    const { roomId } = assertRoomAccess(ws, data.roomId);
    await persistRoomCodeFromYDoc(roomId);
    await finalizeMeeting(roomId, ws.userId);
    broadcastRoomState(roomId);
    broadcastYDocState(roomId);
    sendAck(ws, data.requestId);
  };

  return {
    runCode: runCodeHandler,
    executeCodeAndResolve: executeCodeAndResolveHandler,
    startEmergencyMeeting: startEmergencyMeetingHandler,
    voteInMeeting: voteInMeetingHandler,
    finalizeMeeting: finalizeMeetingHandler,
  };
};

module.exports = {
  createGameplayHandlers,
};
