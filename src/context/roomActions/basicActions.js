import { get, onDisconnect, onValue, push, ref, set, update } from "firebase/database";
import { buildInitialRoomData } from "./payloads.js";
import { getRoomRef, getRoomSnapshot, getSnippetRef } from "./refs.js";
import {
  ensureAlivePlayer,
  ensureRoomPlayer,
  getRoleTaskConfig,
  getRoleKey,
  getSnippetCode,
  hasUsableCode,
  normalizeLockedRanges,
  normalizeStoredCode,
  sanitizeRoleTaskConfig,
} from "./utils.js";

export const createBasicRoomActions = ({ database, getRequiredUser }) => ({
  createRoom: async (roomId, hostName) => {
    const user = getRequiredUser();
    return set(getRoomRef(database, roomId), buildInitialRoomData(user, hostName));
  },

  sendmessage: async (roomId, message) => {
    const user = getRequiredUser();
    const trimmedMessage = String(message || "").trim();

    if (!trimmedMessage) {
      throw new Error("Message cannot be empty.");
    }

    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();
    const player = ensureAlivePlayer(room, user);

    if (room.codeRunPending) {
      throw new Error("Chat is disabled while the code result is being reviewed.");
    }

    const chatref = ref(database, `rooms/${roomId}/chat`);

    return push(chatref, {
      uid: user.uid,
      name: player.name || "Player",
      text: trimmedMessage,
      createdAt: Date.now(),
    });
  },

  updatecode: async (roomId, code) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    ensureAlivePlayer(room, user);

    if (room.gameState !== "playing") {
      throw new Error("Code can only be edited during gameplay.");
    }

    if (room.codeRunPending) {
      throw new Error("Code editing is paused while the code result is being reviewed.");
    }

    const normalizedCode = normalizeStoredCode(code);

    return update(ref(database, `rooms/${roomId}/codestate`), {
      code: normalizedCode,
      updatedAt: Date.now(),
    });
  },

  getcode: async (roomId) => {
    const user = getRequiredUser();
    const roomSnapshot = await getRoomSnapshot(database, roomId);
    const room = roomSnapshot.val();
    const winner = room?.winner;
    const currentPlayerRole = getRoleKey(room?.players?.[user.uid]?.role || "player");

    if (!winner) return null;

    const existingCode = normalizeStoredCode(room?.codestate?.code || "");
    const snippetSnap = await get(getSnippetRef(database, winner));

    if (!snippetSnap.exists()) return null;

    const snippet = snippetSnap.val();
    const normalizedSnippetCode = getSnippetCode(snippet);

    if (!hasUsableCode(normalizedSnippetCode)) {
      throw new Error(`Snippet code is empty for topic "${winner}".`);
    }

    if (!hasUsableCode(existingCode)) {
      await set(ref(database, `rooms/${roomId}/codestate`), {
        language: snippet.language || "cpp",
        code: normalizedSnippetCode,
        updatedAt: Date.now(),
        lockedRanges: normalizeLockedRanges(snippet.lockedRanges),
        playersCursor: {},
        tasks: {},
      });
    }

    const taskConfig = getRoleTaskConfig(snippet.tasks || {}, currentPlayerRole);

    return {
      language: snippet.language || "javascript",
      code: hasUsableCode(existingCode) ? existingCode : normalizedSnippetCode,
      templateCode: normalizedSnippetCode,
      lockedRanges: normalizeLockedRanges(snippet.lockedRanges),
      taskData: sanitizeRoleTaskConfig(taskConfig),
    };
  },

  joinRoom: async (roomId, playerName) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();
    const existingPlayer = room?.players?.[user.uid] || {};

    return update(ref(database, `rooms/${roomId}/players/${user.uid}`), {
      uid: user.uid,
      name: playerName,
      status: existingPlayer.status || "alive",
      alive: existingPlayer.alive ?? true,
      role: existingPlayer.role || "Player",
      connectedAt: Date.now(),
    });
  },

  registerPresence: async (roomId) => {
    const user = getRequiredUser();
    const playerRef = ref(database, `rooms/${roomId}/players/${user.uid}`);
    await onDisconnect(playerRef).remove();
  },

  voteForTopic: async (roomId, topicId) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    ensureRoomPlayer(room, user);

    return update(ref(database, `rooms/${roomId}/votes`), {
      [user.uid]: topicId,
    });
  },

  addPlayer: (roomId, playerId, data) => {
    return set(ref(database, `rooms/${roomId}/players/${playerId}`), data);
  },

  setContent: (roomId, content) => {
    return set(ref(database, `rooms/${roomId}/content`), content);
  },

  listenRoom: (roomId, callback) => {
    return onValue(getRoomRef(database, roomId), (snapshot) => {
      callback(snapshot.val());
    });
  },
});
