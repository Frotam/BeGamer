const express = require("express");
const { Worker } = require("bullmq");
require("dotenv").config();

const PORT = Number(process.env.PORT) || 3000;
const connection = { url: process.env.REDIS_URL };

const parseRunnerList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const RUNNERS = {
  cpp: parseRunnerList(process.env.CPP_RUNNERS),
  javascript: parseRunnerList(process.env.JS_RUNNERS),
  js: parseRunnerList(process.env.JS_RUNNERS),
  python: parseRunnerList(process.env.PY_RUNNERS),
  py: parseRunnerList(process.env.PY_RUNNERS),
};

function getRunner(language) {
  const key = String(language || "").toLowerCase();
  const list = RUNNERS[key];

  if (!list || list.length === 0) {
    throw new Error(`No runners configured for language: ${language}`);
  }

  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

async function runOnRunner(language, code) {
  const runner = getRunner(language);
  const response = await fetch(`${runner}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Runner request failed (${response.status}): ${text}`);
  }

  return response.json();
}

const worker = new Worker(
  "code-runner",
  async (job) => {
    const { code, language } = job.data || {};
    console.log(`[worker] Job started: ${job.id}, language=${language}`);
    return runOnRunner(language, code);
  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`[worker] Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Job failed: ${job?.id}`, err);
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

const app = express();
app.get("/", (_req, res) => {
  res.send("Worker running");
});

app.listen(PORT, () => {
  console.log(`[worker] Health server listening on port ${PORT}`);
});
