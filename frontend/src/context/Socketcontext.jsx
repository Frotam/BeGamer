import { createContext, useContext, useEffect, useRef, useState } from "react";

const SocketContext = createContext(null);
const RECONNECT_DELAY_MS = 1500;
const SOCKET_USER_ID_STORAGE_KEY = "socketUserId";

const resolveSocketUrl = () => {
  const configuredUrl = import.meta.env.VITE_WS_URL;
  const savedSocketUserId =
    typeof window !== "undefined"
      ? String(localStorage.getItem(SOCKET_USER_ID_STORAGE_KEY) || "").trim()
      : "";

  if (configuredUrl) {
    const url = new URL(configuredUrl);
    if (savedSocketUserId) {
      url.searchParams.set("sessionUserId", savedSocketUserId);
    }
    return url.toString();
  }

  if (typeof window === "undefined") {
    return "ws://localhost:5001";
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  const baseUrl = isLocalHost
    ? `${protocol}://${host}:5001`
    : `${protocol}://${window.location.host}`;
  const url = new URL(baseUrl);

  if (savedSocketUserId) {
    url.searchParams.set("sessionUserId", savedSocketUserId);
  }

  return url.toString();
};

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  const pendingRequestsRef = useRef(new Map());
  const requestCounterRef = useRef(0);
  const cleanupSocketRef = useRef(() => {});
  const reconnectTimerRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketUserId, setSocketUserId] = useState("");

  useEffect(() => {
    let disposed = false;

    const rejectPendingRequests = () => {
      pendingRequestsRef.current.forEach(({ reject }) => {
        reject(new Error("Socket connection closed."));
      });
      pendingRequestsRef.current.clear();
    };

    const connect = () => {
      const socket = new WebSocket(resolveSocketUrl());
      socketRef.current = socket;

      let manuallyClosed = false;

      cleanupSocketRef.current = () => {
        manuallyClosed = true;

        if (
          socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING
        ) {
          socket.close();
        }
      };

      socket.onopen = () => {
        if (disposed || manuallyClosed) return;
        setIsConnected(true);
      };

      socket.onclose = () => {
        if (disposed || manuallyClosed) return;

        setIsConnected(false);
        rejectPendingRequests();
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = (error) => {
        if (disposed || manuallyClosed) return;
        console.error("Socket error", error);
      };

      socket.onmessage = (event) => {
        let data;

        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

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

        if (data.type === "identity") {
          const nextUserId = String(data.userId || "").trim();
          setSocketUserId(nextUserId);
          if (nextUserId) {
            window.__socketUserId = nextUserId;
            localStorage.setItem(SOCKET_USER_ID_STORAGE_KEY, nextUserId);
            window.dispatchEvent(new Event("socket-user-changed"));
          }
        }

        const handlers = listenersRef.current[data.type] || [];
        handlers.forEach((callback) => callback(data));
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      cleanupSocketRef.current();
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
        socketUserId,
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
