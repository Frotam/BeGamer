import { get, ref } from "firebase/database";

export const getRoomRef = (database, roomId) => ref(database, `rooms/${roomId}`);

export const getRoomSnapshot = async (database, roomId) => {
  const snapshot = await get(getRoomRef(database, roomId));

  if (!snapshot.exists()) {
    throw new Error("Room not found.");
  }

  return snapshot;
};

export const getSnippetRef = (database, winner) => {
  return ref(database, `codes/${winner}`);
};
