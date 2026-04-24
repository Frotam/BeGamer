import { useEffect, useState } from "react";

export const readSessionUser = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const uid = localStorage.getItem("uid");
  const name = localStorage.getItem("username") || "";

  if (!uid) {
    return null;
  }

  return {
    uid,
    name,
  };
};

export const syncSessionUser = (user) => {
  if (typeof window === "undefined" || !user?.uid) {
    return null;
  }

  localStorage.setItem("uid", user.uid);

  if (typeof user.name === "string") {
    localStorage.setItem("username", user.name);
  }

  const sessionUser = readSessionUser();
  window.dispatchEvent(new Event("session-user-changed"));
  return sessionUser;
};

export const ensureSessionUser = (name = "") => {
  const existingUser = readSessionUser();

  if (existingUser?.uid) {
    if (name && existingUser.name !== name) {
      return syncSessionUser({ ...existingUser, name });
    }

    return existingUser;
  }

  return syncSessionUser({
    uid: crypto.randomUUID(),
    name,
  });
};

export const useSessionUser = () => {
  const [sessionUser, setSessionUser] = useState(() => readSessionUser());

  useEffect(() => {
    const updateSessionUser = () => {
      setSessionUser(readSessionUser());
    };

    window.addEventListener("storage", updateSessionUser);
    window.addEventListener("session-user-changed", updateSessionUser);

    return () => {
      window.removeEventListener("storage", updateSessionUser);
      window.removeEventListener("session-user-changed", updateSessionUser);
    };
  }, []);

  return sessionUser;
};
