const WebSocket = require("ws");

const send = (ws, payload) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

const sendAck = (ws, requestId, payload = {}) => {
  if (!requestId) {
    return;
  }

  send(ws, {
    type: "ack",
    requestId,
    ...payload,
  });
};

const sendError = (ws, message, requestId) => {
  send(ws, {
    type: "error",
    message,
    requestId,
  });
};

module.exports = {
  send,
  sendAck,
  sendError,
};
