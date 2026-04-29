const { randomUUID } = require("crypto");

const bindConnection = ({ wss, send, routeMessage, cleanupUserOnClose }) => {
  wss.on("connection", (ws) => {
    const userId = randomUUID();
    ws.userId = userId;
    ws.user = { uid: userId, name: null };

    send(ws, {
      type: "identity",
      userId,
    });

    ws.on("message", (message) => {
      void routeMessage(ws, message);
    });

    ws.on("close", () => {
      cleanupUserOnClose(ws);
    });
  });
};

module.exports = {
  bindConnection,
};
