const createMessageRouter = ({ handlersByType, sendError }) => {
  const routeMessage = async (ws, rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage);
    } catch {
      sendError(ws, "Invalid JSON received.");
      return;
    }

    const handler = handlersByType[data.type];

    if (!handler) {
      sendError(ws, "Unsupported websocket action.", data.requestId);
      return;
    }

    try {
      await handler(ws, data);
    } catch (error) {
      sendError(ws, error.message || "Request failed.", data.requestId);
    }
  };

  return {
    routeMessage,
  };
};

module.exports = {
  createMessageRouter,
};
