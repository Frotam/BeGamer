import { get, onDisconnect, onValue, push, ref, set, update, serverTimestamp } from "firebase/database";
import { buildInitialRoomData, buildLobbyResetPayload } from "./payloads.js";
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

  updatecursor: async (roomId, cursor = {}) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();

    ensureAlivePlayer(room, user);

    if (room.gameState !== "playing") {
      throw new Error("Cursor updates are only allowed during gameplay.");
    }

    const line = Number(cursor.line) || 1;
    const column = Number(cursor.column) || 1;

    return update(ref(database, `rooms/${roomId}/codestate/playersCursor/${user.uid}`), {
      line: Math.max(1, line),
      column: Math.max(1, column),
      updatedAt: serverTimestamp(),
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

    const playerTaskConfig = getRoleTaskConfig(snippet.tasks || {}, "player");
    const imposterTaskConfig = getRoleTaskConfig(snippet.tasks || {}, "imposter");
    const playerTaskData = sanitizeRoleTaskConfig(playerTaskConfig);
    const imposterTaskData = sanitizeRoleTaskConfig(imposterTaskConfig);
    
    // Structure tasks as { player: {...}, imposter: {...} }
    const tasksToSave = {};
    
    if (playerTaskData) {
      tasksToSave["player"] = {
        expectedOutput: playerTaskData.expectedOutput,
        instructions: playerTaskData.instructions,
      };
    }
    
    if (imposterTaskData) {
      tasksToSave["imposter"] = {
        expectedOutput: imposterTaskData.expectedOutput,
        instructions: imposterTaskData.instructions,
      };
    }
    
    if (!hasUsableCode(existingCode)) {
      await set(ref(database, `rooms/${roomId}/codestate`), {
        language: snippet.language || "cpp",
        code: normalizedSnippetCode,
        updatedAt: Date.now(),
        lockedRanges: normalizeLockedRanges(snippet.lockedRanges),
        playersCursor: {},
        tasks: tasksToSave,
      });
    } else {
      // Always update tasks even if code already exists
      await update(ref(database, `rooms/${roomId}/codestate`), {
        tasks: tasksToSave,
        updatedAt: Date.now(),
      });
    }

    // Return task data for current player's role only
    const currentTaskData = currentPlayerRole === "imposter" ? imposterTaskData : playerTaskData;

    return {
      language: snippet.language || "javascript",
      code: hasUsableCode(existingCode) ? existingCode : normalizedSnippetCode,
      templateCode: normalizedSnippetCode,
      lockedRanges: normalizeLockedRanges(snippet.lockedRanges),
      taskData: currentTaskData,
    };
  },

  joinRoom: async (roomId, playerName) => {
    const user = getRequiredUser();
    const snapshot = await getRoomSnapshot(database, roomId);
    const room = snapshot.val();
    const existingPlayer = room?.players?.[user.uid] || {};
    const isLiveGame = room?.gameState === "playing" || room?.gameState === "meeting";
    const isExistingPlayer = Boolean(existingPlayer && existingPlayer.uid);
    const isSpectator = isLiveGame && !isExistingPlayer;

    const playerPayload = isExistingPlayer
      ? {
          name: playerName,
          connectedAt: Date.now(),
        }
      : {
          uid: user.uid,
          name: playerName,
          status: existingPlayer.status || (isSpectator ? "spectating" : "alive"),
          alive: isSpectator ? false : existingPlayer.alive ?? true,
          role: existingPlayer.role || "Player",
          connectedAt: Date.now(),
        };

    return update(ref(database, `rooms/${roomId}/players/${user.uid}`), playerPayload);
  },

  registerPresence: async (roomId) => {
    const user = getRequiredUser();
    const presenceRef = ref(database, `rooms/${roomId}/presence/${user.uid}`);

    await set(presenceRef, {
      connectedAt: Date.now(),
    });

    await onDisconnect(presenceRef).remove();
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

  autoResetLobbyAfterGameEnd: async (roomId) => {
    const roomSnapshot = await getRoomSnapshot(database, roomId);
    const room = roomSnapshot.val();
    
    // Check if game has ended (crew_win, imposter_win, insufficient, or draw)
    const gameEndedStates = ["crew_win", "imposter_win", "insufficient", "draw"];
    
    if (gameEndedStates.includes(room?.gameState)) {
      // Wait 5 seconds, then reset to lobby
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            // Use buildLobbyResetPayload to properly reset everything
            const resetPayload = buildLobbyResetPayload(room);
            await update(getRoomRef(database, roomId), resetPayload);
            resolve();
          } catch (error) {
            console.error("Auto reset failed:", error);
            resolve();
          }
        }, 5000); // 5 seconds delay
      });
    }
  },
});
