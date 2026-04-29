const WebSocket = require("ws");
const Y = require("yjs");
const { rooms, yDocs } = require("../roomsStore");
const { executeCodeAndResolve } = require("../Roomactions/gameActions");
const { normalizeStoredCode, removePlayer, transferHost } = require("../Roomactions/utils");
const { send, sendAck, sendError } = require("./utils/socketSend");
const { bindConnection } = require("./connection");
const { createMessageRouter } = require("./router");
const { createBroadcastService } = require("./services/broadcastService");
const { createCodeReviewService } = require("./services/codeReviewService");
const { createRoomAccessService } = require("./services/roomAccessService");
const { createRoomLifecycleService } = require("./services/roomLifecycleService");
const { createYjsCodeService } = require("./services/yjsCodeService");
const { createChatHandlers } = require("./handlers/chatHandlers");
const { createEditorHandlers } = require("./handlers/editorHandlers");
const { createGameplayHandlers } = require("./handlers/gameplayHandlers");
const { createRoomEntryHandlers } = require("./handlers/roomEntryHandlers");
const { createRoomExitHandlers } = require("./handlers/roomExitHandlers");
const { createVotingHandlers } = require("./handlers/votingHandlers");

function registerRoom(server) {
  const wss = new WebSocket.Server({ server });

  const yjsCodeService = createYjsCodeService({ rooms, yDocs, normalizeStoredCode, Y });
  const { broadcast, broadcastRoomState, broadcastYDocState } = createBroadcastService({
    rooms,
    getYDoc: yjsCodeService.getYDoc,
    Y,
    send,
  });
  const { assertRoomAccess } = createRoomAccessService({ rooms });

  const roomLifecycle = createRoomLifecycleService({
    rooms,
    yDocs,
    removePlayer,
    transferHost,
  });

  const { runServerCodeReview } = createCodeReviewService({
    rooms,
    executeCodeAndResolve,
    broadcastRoomState,
  });

  const shared = { Y, assertRoomAccess, broadcast, broadcastRoomState, broadcastYDocState, send, sendAck };

  const handlersByType = {
    ...createRoomEntryHandlers({
      ...shared,
      attachSocketToRoom: roomLifecycle.attachSocketToRoom,
      getYDoc: yjsCodeService.getYDoc,
    }),
    ...createRoomExitHandlers({
      ...shared,
      countUserSockets: roomLifecycle.countUserSockets,
      destroyRoomIfEmpty: roomLifecycle.destroyRoomIfEmpty,
      ensureHostExists: roomLifecycle.ensureHostExists,
      removePlayer,
      resolveGameOnLeaveIfNeeded: roomLifecycle.resolveGameOnLeaveIfNeeded,
    }),
    ...createEditorHandlers({
      ...shared,
      getFullCodeFromYDoc: yjsCodeService.getFullCodeFromYDoc,
      getYDoc: yjsCodeService.getYDoc,
      replaceYDocTextFromRoom: yjsCodeService.replaceYDocTextFromRoom,
    }),
    ...createVotingHandlers({ ...shared, replaceYDocTextFromRoom: yjsCodeService.replaceYDocTextFromRoom }),
    ...createGameplayHandlers({
      ...shared,
      persistRoomCodeFromYDoc: yjsCodeService.persistRoomCodeFromYDoc,
      persistSubmittedCodeForRun: yjsCodeService.persistSubmittedCodeForRun,
      runServerCodeReview,
    }),
    ...createChatHandlers({ ...shared }),
  };

  const { routeMessage } = createMessageRouter({ handlersByType, sendError });

  bindConnection({
    cleanupUserOnClose: (ws) => roomLifecycle.cleanupUserOnClose(ws, broadcastRoomState),
    routeMessage,
    send,
    wss,
  });
}

module.exports = registerRoom;
