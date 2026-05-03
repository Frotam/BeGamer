const { randomUUID } = require("crypto");

const SESSION_USER_ID_QUERY = "sessionUserId";

const parseRequestedUserId = (req) => {
  try {
    const url = new URL(req.url || "/", "ws://localhost");
    const requestedUserId = String(
      url.searchParams.get(SESSION_USER_ID_QUERY) || "",
    ).trim();

    if (!requestedUserId || requestedUserId.length > 128) {
      return null;
    }

    return requestedUserId;
  } catch {
    return null;
  }
};

const bindConnection = ({ wss, send, routeMessage, cleanupUserOnClose }) => {
  wss.on("connection", (ws, req) => {
    const userId = parseRequestedUserId(req) || randomUUID();
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
