const { fetchSnippetByTopic } = require("./snippets");

const normalizeArrayLike = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => Number(left) - Number(right))
      .map((key) => String(value[key] ?? "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
};

const normalizeTask = (task, type) => {
  if (!task || typeof task !== "object") {
    return null;
  }

  return {
    type,
    instructions: normalizeArrayLike(task.instructions),
    expectedOutput: normalizeArrayLike(task.expectedOutput),
  };
};

const normalizeSnippetPayload = (topicId, snippet) => {
  if (!snippet || typeof snippet !== "object") {
    throw new Error(`Snippet payload is invalid for topic "${topicId}".`);
  }

  const playerTask = normalizeTask(
    snippet?.tasks?.player || snippet?.player,
    "player"
  );
  const imposterTask = normalizeTask(
    snippet?.tasks?.imposter || snippet?.imposter,
    "imposter"
  );

  return {
    ...snippet,
    code: snippet.code || snippet.starterCode || "",
    starterCode: snippet.starterCode || snippet.code || "",
    language: snippet.language || "cpp",
    lockedRanges: Array.isArray(snippet.lockedRanges) ? snippet.lockedRanges : [],
    tasks: {
      ...(playerTask ? { player: playerTask } : {}),
      ...(imposterTask ? { imposter: imposterTask } : {}),
    },
  };
};

const getFirebaseDatabaseUrl = () => {
  if (process.env.FIREBASE_DATABASE_URL) {
    return process.env.FIREBASE_DATABASE_URL;
  }

  if (
    process.env.VITE_FIREBASE_DATABASE_URL &&
    /^https?:\/\//i.test(process.env.VITE_FIREBASE_DATABASE_URL) &&
    !process.env.VITE_FIREBASE_DATABASE_URL.includes("localhost")
  ) {
    return process.env.VITE_FIREBASE_DATABASE_URL;
  }

  if (process.env.VITE_FIREBASE_PROJECT_ID) {
    return `https://${process.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`;
  }

  return null;
};

const fetchSnippetFromFirebase = async (topicId) => {
  const databaseUrl = getFirebaseDatabaseUrl();

  if (!databaseUrl) {
    return normalizeSnippetPayload(topicId, await fetchSnippetByTopic(topicId));
  }

  const baseUrl = databaseUrl.replace(/\/+$/, "");
  const snapshotUrl = `${baseUrl}/codes/${encodeURIComponent(topicId)}.json`;

  let response;

  try {
    response = await fetch(snapshotUrl, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to reach Firebase for topic "${topicId}": ${error.message}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Firebase returned ${response.status} while fetching topic "${topicId}".`
    );
  }

  const snippet = await response.json();

  if (!snippet) {
    throw new Error(`No snippet found in Firebase for topic "${topicId}".`);
  }

  return normalizeSnippetPayload(topicId, snippet);
};

module.exports = {
  fetchSnippetFromFirebase,
};
