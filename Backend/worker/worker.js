require("dotenv").config();

const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const PORT = Number(process.env.WORKERPORT) || 3000;
const REDIS_URL = process.env.REDIS_URL;
const DOCKER_CPP_IMAGE =
  process.env.DOCKER_CPP_IMAGE || "begameer-cpp-runner";
const DOCKER_JS_IMAGE = process.env.DOCKER_JS_IMAGE || "node:20-alpine";
const DOCKER_PYTHON_IMAGE =
  process.env.DOCKER_PYTHON_IMAGE || "python:3.11-alpine";
const JOB_TIMEOUT_MS = Number(process.env.WORKER_JOB_TIMEOUT_MS) || 15000;
const ROOMLESS_COMMAND_TIMEOUT_MS =
  Number(process.env.WORKER_DOCKER_TIMEOUT_MS) || JOB_TIMEOUT_MS;

const app = express();

const connection = {
  url: REDIS_URL,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 100, 2000),
};

const healthClient = new Redis(REDIS_URL);

let isRedisUp = true;
let processedJobs = 0;
let failedJobs = 0;
let activeJobs = 0;
let lastJobStartedAt = null;
let lastJobCompletedAt = null;
let lastJobFailedAt = null;
let lastJobError = null;

const LANGUAGE_CONFIG = {
  cpp: {
    filename: "main.cpp",
    image: DOCKER_CPP_IMAGE,
    command: [
      "sh",
      "-lc",
      "g++ -std=c++17 -O2 -o /tmp/main /tmp/main.cpp && /tmp/main",
    ],
  },
  javascript: {
    filename: "main.js",
    image: DOCKER_JS_IMAGE,
    command: ["node", "/tmp/main.js"],
  },
  python: {
    filename: "main.py",
    image: DOCKER_PYTHON_IMAGE,
    command: ["python", "/tmp/main.py"],
  },
};

const runCommand = (command, args, timeoutMs) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (handler) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      handler();
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error(`Command timed out after ${timeoutMs}ms.`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      finish(() =>
        resolve({
          code,
          stdout,
          stderr,
        }),
      );
    });
  });
};

const normalizeLanguage = (language) => {
  return String(language || "")
    .trim()
    .toLowerCase();
};

const createWorkspace = async () => {
  const workspaceId = `begameer-worker-${crypto.randomUUID()}`;
  const workspacePath = path.join(os.tmpdir(), workspaceId);
  await fs.mkdir(workspacePath, { recursive: true });
  return workspacePath;
};

const cleanupWorkspace = async (workspacePath) => {
  if (!workspacePath) {
    return;
  }

  try {
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch (error) {
    console.error("[worker] Failed to remove temp workspace:", error.message);
  }
};

const runOnRunner = async (language, code) => {
  const languageKey = normalizeLanguage(language);
  const config = LANGUAGE_CONFIG[languageKey];

  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const normalizedCode = String(code || "");

  if (!normalizedCode.trim()) {
    throw new Error("Code is empty.");
  }

  const workspacePath = await createWorkspace();
  const sourcePath = path.join(workspacePath, config.filename);
  let containerId = null;

  try {
    await fs.writeFile(sourcePath, normalizedCode, "utf8");

    const createResult = await runCommand(
      "docker",
      [
        "create",
        "--network",
        "none",
        config.image,
        ...config.command,
      ],
      ROOMLESS_COMMAND_TIMEOUT_MS,
    );

    if (createResult.code !== 0) {
      throw new Error(
        String(createResult.stderr || createResult.stdout || "").trim() ||
          "Failed to create runner container.",
      );
    }

    containerId = String(createResult.stdout || "").trim();

    const copyResult = await runCommand(
      "docker",
      ["cp", sourcePath, `${containerId}:/tmp/${config.filename}`],
      ROOMLESS_COMMAND_TIMEOUT_MS,
    );

    if (copyResult.code !== 0) {
      throw new Error(
        String(copyResult.stderr || copyResult.stdout || "").trim() ||
          "Failed to copy code into runner container.",
      );
    }

    const result = await runCommand(
      "docker",
      [
        "start",
        "-a",
        containerId,
      ],
      JOB_TIMEOUT_MS,
    );
    const combinedError = String(result.stderr || "").trim();

    if (result.code !== 0) {
      throw new Error(combinedError || `Runner exited with code ${result.code}.`);
    }

    return String(result.stdout || "");
  } finally {
    if (containerId) {
      const rmResult = await runCommand(
        "docker",
        ["rm", "-f", containerId],
        ROOMLESS_COMMAND_TIMEOUT_MS,
      ).catch(() => null);

      if (rmResult && rmResult.code !== 0) {
        console.error(
          `[worker] Failed to remove runner container ${containerId}: ${
            String(rmResult.stderr || rmResult.stdout || "").trim()
          }`,
        );
      }
    }

    await cleanupWorkspace(workspacePath);
  }
};

const worker = new Worker(
  "code-runner",
  async (job) => {
    const { code, language } = job.data || {};
    activeJobs += 1;
    lastJobStartedAt = Date.now();
    console.log(`[worker] Job started: ${job.id}, language=${language}`);

    try {
      const output = await runOnRunner(language, code);
      processedJobs += 1;
      lastJobCompletedAt = Date.now();
      lastJobError = null;
      console.log(`[worker] Job completed: ${job.id}`);
      return output;
    } catch (error) {
      failedJobs += 1;
      lastJobFailedAt = Date.now();
      lastJobError = error.message;
      console.error(`[worker] Job failed: ${job.id} - ${error.message}`);
      throw error;
    } finally {
      activeJobs = Math.max(0, activeJobs - 1);
    }
  },
  { connection },
);

worker.on("ready", () => {
  console.log("[worker] BullMQ worker is ready.");
});

worker.on("error", (error) => {
  console.error("[worker] Worker error:", error.message);
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] Failed event: ${job?.id || "unknown-job"} - ${error.message}`,
  );
});

app.get("/", (_req, res) => {
  res.send("Worker running");
});

app.get("/health", async (_req, res) => {
  try {
    await healthClient.ping();
    res.json({
      ok: true,
      redis: "up",
      activeJobs,
      processedJobs,
      failedJobs,
      lastJobStartedAt,
      lastJobCompletedAt,
      lastJobFailedAt,
      lastJobError,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      redis: "down",
      error: error.message,
      activeJobs,
      processedJobs,
      failedJobs,
      lastJobStartedAt,
      lastJobCompletedAt,
      lastJobFailedAt,
      lastJobError,
    });
  }
});

setInterval(async () => {
  try {
    await healthClient.ping();

    if (!isRedisUp) {
      console.log("[health] Redis RECOVERED");
      isRedisUp = true;
    }
  } catch (error) {
    if (isRedisUp) {
      console.error("[health] Redis DOWN:", error.message);
      isRedisUp = false;
    }
  }
}, 5000);

app.listen(PORT, () => {
  console.log(`[worker] Health server listening on ${PORT}`);
});
