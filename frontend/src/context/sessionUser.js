import { useEffect, useState } from "react";

let runtimeUserId = null;
const SOCKET_USER_ID_STORAGE_KEY = "socketUserId";

export const readSessionUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (!runtimeUserId && typeof window.__socketUserId === "string") {
    runtimeUserId = window.__socketUserId.trim() || null;
  }

  if (!runtimeUserId) {
    const persistedUserId = String(
      localStorage.getItem(SOCKET_USER_ID_STORAGE_KEY) || "",
    ).trim();
    runtimeUserId = persistedUserId || null;
  }

  const name = localStorage.getItem("username") || "";

  if (!runtimeUserId) {
    return null;
  }

  return {
    uid: runtimeUserId,
    name,
  };
};

export const syncSessionUser = (user) => {
  if (typeof window === "undefined") {
    return null;
  }

  if (typeof user?.uid === "string" && user.uid.trim()) {
    runtimeUserId = user.uid.trim();
    localStorage.setItem(SOCKET_USER_ID_STORAGE_KEY, runtimeUserId);
  }

  if (typeof user.name === "string") {
    localStorage.setItem("username", user.name);
  }

  const sessionUser = readSessionUser();
  window.dispatchEvent(new Event("session-user-changed"));
  return sessionUser;
};

export const ensureSessionUser = (name = "") => {
  const existingUser = readSessionUser() || { uid: runtimeUserId, name: "" };
  if (name && existingUser.name !== name) {
    return syncSessionUser({ ...existingUser, name });
  }
  return existingUser;
};

export const useSessionUser = () => {
  const [sessionUser, setSessionUser] = useState(() => readSessionUser());

  useEffect(() => {
    const updateSessionUser = () => {
      setSessionUser(readSessionUser());
    };

    window.addEventListener("storage", updateSessionUser);
    window.addEventListener("session-user-changed", updateSessionUser);
    window.addEventListener("socket-user-changed", updateSessionUser);

    return () => {
      window.removeEventListener("storage", updateSessionUser);
      window.removeEventListener("session-user-changed", updateSessionUser);
      window.removeEventListener("socket-user-changed", updateSessionUser);
    };
  }, []);

  return sessionUser;
};
