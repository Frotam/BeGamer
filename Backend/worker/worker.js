require("dotenv").config();

const express = require("express");
const { Worker } = require("bullmq");
const Redis = require("ioredis");

const PORT = Number(process.env.WORKERPORT) || 3000;

const connection = {
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 100, 2000),
};

const healthClient = new Redis(process.env.REDIS_URL);

const worker = new Worker(
  "code-runner",
  async (job) => {
    const { code, language } = job.data || {};
    console.log(`[worker] Job started: ${job.id}, language=${language}`);
    return runOnRunner(language, code);
  },
  { connection }
);


let isRedisUp = true;

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