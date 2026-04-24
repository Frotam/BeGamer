import { createContext, useContext, useEffect, useRef, useState } from "react";

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  const pendingRequestsRef = useRef(new Map());
  const requestCounterRef = useRef(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:5001");
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onclose = () => {
      setIsConnected(false);
      pendingRequestsRef.current.forEach(({ reject }) => {
        reject(new Error("Socket connection closed."));
      });
      pendingRequestsRef.current.clear();
    };

    socket.onerror = (error) => {
      console.error("Socket error", error);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.requestId) {
        const pendingRequest = pendingRequestsRef.current.get(data.requestId);

        if (pendingRequest && (data.type === "ack" || data.type === "error")) {
          pendingRequestsRef.current.delete(data.requestId);

          if (data.type === "ack") {
            pendingRequest.resolve(data);
          } else {
            pendingRequest.reject(new Error(data.message || "Request failed."));
          }
        }
      }

      const handlers = listenersRef.current[data.type] || [];
      handlers.forEach((callback) => callback(data));
    };

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = (data) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("Socket is not connected.");
    }

    socketRef.current.send(JSON.stringify(data));
  };

  const sendRequest = (data) => {
    const requestId = `req_${Date.now()}_${requestCounterRef.current++}`;

    return new Promise((resolve, reject) => {
      pendingRequestsRef.current.set(requestId, { resolve, reject });

      try {
        sendMessage({
          ...data,
          requestId,
        });
      } catch (error) {
        pendingRequestsRef.current.delete(requestId);
        reject(error);
      }
    });
  };

  const on = (type, callback) => {
    if (!listenersRef.current[type]) {
      listenersRef.current[type] = [];
    }

    listenersRef.current[type].push(callback);
  };

  const off = (type, callback) => {
    if (!listenersRef.current[type]) {
      return;
    }

    listenersRef.current[type] = listenersRef.current[type].filter((cb) => cb !== callback);
  };

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        sendMessage,
        sendRequest,
        on,
        off,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
