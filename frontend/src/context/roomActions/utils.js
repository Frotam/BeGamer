export const getWinningTopic = (votes = {}) => {
  const voteCounts = {};
  let winner = null;
  let maxVotes = 0;

  Object.values(votes).forEach((topicId) => {
    voteCounts[topicId] = (voteCounts[topicId] || 0) + 1;

    if (voteCounts[topicId] > maxVotes) {
      maxVotes = voteCounts[topicId];
      winner = topicId;
    }
  });

  return { winner, maxVotes };
};

export const normalizeStoredCode = (code = "") => {
  return String(code)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
};

export const hasUsableCode = (code) => {
  return typeof code === "string" && code.trim().length > 0;
};

export const hasUsableTasks = (tasks) => {
  return (
    Boolean(tasks) &&
    typeof tasks === "object" &&
    Object.keys(tasks).length > 0
  );
};

export const getSnippetCode = (snippet) => {
  return normalizeStoredCode(snippet?.code || snippet?.starterCode || "");
};

export const getRoleKey = (role) => {
  return String(role || "player").trim().toLowerCase();
};

export const getRoleTaskConfig = (tasks = {}, role) => {
  const roleKey = getRoleKey(role);
  const roleTask = tasks?.[roleKey] || tasks?.[role] || null;

  if (roleTask && typeof roleTask === "object") {
    return roleTask;
  }

  return null;
};

export const sanitizeRoleTaskConfig = (taskConfig) => {
  if (!taskConfig || typeof taskConfig !== "object") {
    return null;
  }

  const rawInstructions = taskConfig.instructions;
  let instructions = [];

  if (Array.isArray(rawInstructions)) {
    instructions = rawInstructions
      .map((instruction) => String(instruction || "").trim())
      .filter(Boolean);
  } else if (typeof rawInstructions === "string" && rawInstructions.trim()) {
    instructions = [rawInstructions.trim()];
  }

  return {
    type: getRoleKey(taskConfig.type || taskConfig.role),
    instructions,
    expectedOutput: taskConfig.expectedOutput || null,
  };
};
export const normalizeOutputLines = (output) => {

 const normalized = String(output || "")
  .replace(/,/g,"\n")
  .replace(/\r\n/g,"\n")
  .split("\n")
  .map(line => line.trim());

 while(
  normalized.length>0 &&
  normalized[normalized.length-1]===""
 ){
  normalized.pop();
 }

 return normalized;
};

export const getExpectedOutputLines = (taskConfig) => {
  if (!taskConfig || typeof taskConfig !== "object") {
    return [];
  }

  const expectedOutput = taskConfig.expectedOutput;

  if (Array.isArray(expectedOutput)) {
    return expectedOutput.map((line) => String(line).trim());
  }

  if (typeof expectedOutput === "string") {
    return normalizeOutputLines(expectedOutput);
  }

  return [];
};

export const compareOutputs = (actualOutput, expectedOutput) => {
  const actualLines = normalizeOutputLines(actualOutput);
  const expectedLines = getExpectedOutputLines(expectedOutput);
console.log(actualLines,expectedLines);

  if (actualLines.length !== expectedLines.length) {
    return false;
  }

  return actualLines.every((line, index) => line === expectedLines[index]);
};

export const normalizeLockedRanges = (lockedRanges) => {
  if (!Array.isArray(lockedRanges)) {
    return [];
  }

  return lockedRanges
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
};

const buildLockedLineIndexes = (templateCode, lockedRanges) => {
  const normalizedTemplate = normalizeStoredCode(templateCode);
  const lines = normalizedTemplate.split("\n");
  const normalizedLockedRanges = normalizeLockedRanges(lockedRanges);

  if (normalizedLockedRanges.length === 0) {
    return [];
  }

  return lines.reduce((indexes, line, index) => {
    const isLockedLine = normalizedLockedRanges.some((lockedRange) => {
      return line.includes(lockedRange);
    });

    if (isLockedLine) {
      indexes.push(index);
    }

    return indexes;
  }, []);
};

export const isCodeWithinLockedRanges = (
  templateCode,
  candidateCode,
  lockedRanges
) => {
  const normalizedTemplate = normalizeStoredCode(templateCode);
  const normalizedCandidate = normalizeStoredCode(candidateCode);
  const protectedLineIndexes = buildLockedLineIndexes(
    normalizedTemplate,
    lockedRanges
  );

  if (protectedLineIndexes.length === 0) {
    return null;
  }

  const templateLines = normalizedTemplate.split("\n");
  const candidateLines = normalizedCandidate.split("\n");

  let candidateCursor = 0;

  return protectedLineIndexes.every((lineIndex) => {
    const lockedLine = templateLines[lineIndex];
    const nextMatch = candidateLines
      .slice(candidateCursor)
      .findIndex((line) => line === lockedLine);

    if (nextMatch === -1) {
      return false;
    }

    candidateCursor += nextMatch + 1;
    return true;
  });
};

const START_MARKER_PATTERN = /^\s*\/\/\s*(?:START_EDIT_([A-Z0-9_]+)|START_PLAYER_FUNCTIONS)\s*$/i;
const END_MARKER_PATTERN = /^\s*\/\/\s*(?:END_EDIT_([A-Z0-9_]+)|END_PLAYER_FUNCTIONS)\s*$/i;

export const getEditableMarkerPairs = (code = "") => {
  const lines = String(code || "").replace(/\r\n/g, "\n").split("\n");
  const stack = [];
  const pairs = [];

  lines.forEach((line, index) => {
    const startMatch = line.match(START_MARKER_PATTERN);
    if (startMatch) {
      stack.push({
        key: (startMatch[1] || "PLAYER_FUNCTIONS").toUpperCase(),
        startIndex: index,
      });
      return;
    }

    const endMatch = line.match(END_MARKER_PATTERN);
    if (!endMatch) {
      return;
    }

    const key = (endMatch[1] || "PLAYER_FUNCTIONS").toUpperCase();
    const openPair = stack.pop();

    if (!openPair || openPair.key !== key) {
      throw new Error("Editable code markers are malformed.");
    }

    pairs.push({
      key,
      startIndex: openPair.startIndex,
      endIndex: index,
    });
  });

  if (stack.length > 0) {
    throw new Error("Editable code markers are malformed.");
  }

  return pairs.sort((left, right) => left.startIndex - right.startIndex);
};

export const hasEditableMarkers = (code = "") => {
  try {
    return getEditableMarkerPairs(code).length > 0;
  } catch {
    return false;
  }
};

const buildProtectedCodeSignature = (code = "") => {
  const normalizedCode = String(code || "").replace(/\r\n/g, "\n");
  const lines = normalizedCode.split("\n");
  const pairs = getEditableMarkerPairs(normalizedCode);
  const chunks = [];
  let cursor = 0;

  pairs.forEach((pair) => {
    chunks.push(lines.slice(cursor, pair.startIndex + 1).join("\n"));
    chunks.push(`__EDITABLE_BLOCK_${pair.key}__`);
    cursor = pair.endIndex;
  });

  chunks.push(lines.slice(cursor).join("\n"));

  return {
    pairs,
    signature: chunks.join("\n"),
  };
};

export const isCodeWithinEditableMarkers = (templateCode, candidateCode) => {
  try {
    const templateSignature = buildProtectedCodeSignature(templateCode);
    const candidateSignature = buildProtectedCodeSignature(candidateCode);

    if (
      templateSignature.pairs.length === 0 ||
      candidateSignature.pairs.length === 0
    ) {
      return normalizeStoredCode(templateCode) === normalizeStoredCode(candidateCode);
    }

    if (templateSignature.pairs.length !== candidateSignature.pairs.length) {
      return false;
    }

    const hasMatchingMarkerOrder = templateSignature.pairs.every((pair, index) => {
      return pair.key === candidateSignature.pairs[index]?.key;
    });

    if (!hasMatchingMarkerOrder) {
      return false;
    }

    return templateSignature.signature === candidateSignature.signature;
  } catch {
    return false;
  }
};

export const isCodeWithinLockedTemplate = (
  templateCode,
  candidateCode,
  lockedRanges = []
) => {

  if (!areMarkersIntact(templateCode, candidateCode)) {
    return false;
  }

  const templateHasEditableMarkers = hasEditableMarkers(templateCode);
  const candidateHasEditableMarkers = hasEditableMarkers(candidateCode);

  const lockedRangeResult = isCodeWithinLockedRanges(
    templateCode,
    candidateCode,
    lockedRanges
  );

  if (lockedRangeResult !== null) {
    return lockedRangeResult;
  }

  if (!templateHasEditableMarkers && !candidateHasEditableMarkers) {
    return true;
  }

  if (templateHasEditableMarkers && candidateHasEditableMarkers) {
    return isCodeWithinEditableMarkers(templateCode, candidateCode);
  }

  return false;
};

export const getAlivePlayerIds = (players = {}) => {
  return Object.entries(players)
    .filter(([, player]) => player?.alive !== false)
    .map(([playerId]) => playerId);
};

export const ensureRoomPlayer = (room, user) => {
  const player = room?.players?.[user.uid];

  if (!player) {
    throw new Error("Player is not part of this room.");
  }

  return player;
};

export const ensureAlivePlayer = (room, user) => {
  const player = ensureRoomPlayer(room, user);

  if (player.alive === false || player.status === "dead") {
    throw new Error("Spectators cannot perform this action.");
  }

  return player;
};
export const areMarkersIntact = (templateCode, candidateCode) => {

  const markerRegex = /^\s*\/\/\s*(?:START_EDIT_[A-Z0-9_]+|END_EDIT_[A-Z0-9_]+|START_PLAYER_FUNCTIONS|END_PLAYER_FUNCTIONS)\s*$/gim;

  const templateMarkers =
    (templateCode.match(markerRegex) || []).map(x => x.trim());

  const candidateMarkers =
    (candidateCode.match(markerRegex) || []).map(x => x.trim());

  if (templateMarkers.length !== candidateMarkers.length) {
    return false;
  }

  for (let i = 0; i < templateMarkers.length; i++) {
    if (templateMarkers[i] !== candidateMarkers[i]) {
      return false;
    }
  }

  return true;
};
export const getMeetingVoteSummary = (votes = {}) => {
  const counts = {};
  let highestVoteCount = 0;

  Object.values(votes).forEach((targetId) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
    highestVoteCount = Math.max(highestVoteCount, counts[targetId]);
  });

  const topTargets = Object.entries(counts)
    .filter(([, count]) => count === highestVoteCount)
    .map(([targetId]) => targetId);

  return { highestVoteCount, topTargets };
};

export const buildResetPlayers = (players = {}) => {
  return Object.fromEntries(
    Object.entries(players).map(([playerId, player]) => [
      playerId,
      {
        ...player,
        alive: true,
        status: "alive",
        role: "Player",
        color: player.color || player.color === "" ? player.color : undefined,
      },
    ])
  );
};

export const shouldImposterWinByParity = (room) => {
  const alivePlayerIds = getAlivePlayerIds(room?.players || {});

  if (alivePlayerIds.length !== 2 || !room?.imposterId) {
    return false;
  }

  return alivePlayerIds.includes(room.imposterId);
};

export const getAssignedPlayerCount = (room) => {
  return Object.values(room?.players || {}).filter((player) => {
    return player?.role === "Imposter" || player?.role === "Player";
  }).length;
};
