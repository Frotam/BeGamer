export const ROLE_REVEAL_DURATION_MS = 4000;
export const ROLE_REVEAL_STORAGE_PREFIX = "begameer_role_reveal_shown";

export const isActiveGameplayState = (gameState) =>
  gameState === "playing" || gameState === "meeting";

export const isTerminalGameState = (gameState) =>
  gameState === "crew_win" ||
  gameState === "imposter_win" ||
  gameState === "insufficient" ||
  gameState === "draw";

export const getRoleRevealStorageKey = (roomId, round, role) =>
  `${ROLE_REVEAL_STORAGE_PREFIX}:${roomId}:${round}:${role}`;

export const clearRoleRevealStorage = (roomId) => {
  if (typeof sessionStorage === "undefined") return;

  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith(`${ROLE_REVEAL_STORAGE_PREFIX}:${roomId}:`)) {
      sessionStorage.removeItem(key);
    }
  });
};

export const getResultHeading = (gameState) => {
  if (gameState === "crew_win") return "Crew Wins";
  if (gameState === "imposter_win") return "Imposter Wins";
  if (gameState === "draw") return "No One Wins";
  return "Insufficient Players";
};

export const getResultAccentColor = (gameState) => {
  if (gameState === "crew_win") return "#22c55e";
  if (gameState === "imposter_win") return "#ff4d6d";
  return "#7c5cff";
};

export const getResultTextShadow = (gameState) => {
  if (gameState === "crew_win") {
    return `
      0 0 6px rgba(34,197,94,0.45),
      0 0 16px rgba(34,197,94,0.25)
    `;
  }

  if (gameState === "imposter_win") {
    return `
      0 0 6px rgba(255,77,109,0.45),
      0 0 16px rgba(255,77,109,0.25)
    `;
  }

  return `
    0 0 6px rgba(124,92,255,0.45),
    0 0 16px rgba(124,92,255,0.25)
  `;
};
