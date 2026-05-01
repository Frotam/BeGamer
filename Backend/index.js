const express = require("express");
const cors = require("cors");
const http = require("http");
const rateLimit = require("express-rate-limit");
const registerRoom = require("./websocket");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "128kb" }));

app.use(
  "/run-code",
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
  })
);

const PORT = Number(process.env.PORT) || 5001;
const MAX_CODE_BYTES = 100 * 1024;

// 🟢 Runner endpoints
const RUNNERS = {
    cpp: process.env.CPP_RUNNERS.split(","),
  javascript: process.env.JS_RUNNERS.split(","),
  python: process.env.PY_RUNNERS.split(","),
};

// 🟢 simple load balancing
function getRunner(language) {
  const list = RUNNERS[language];
  if (!list || list.length === 0) return null;

  return list[Math.floor(Math.random() * list.length)];
}

// 🟢 call runner
async function runOnRunner(language, code) {
  const runner = getRunner(language);

  if (!runner) {
    throw new Error("No runner available");
  }

  const response = await fetch(`${runner}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  return await response.json();
}

// 🔴 MAIN HANDLER
async function handleRun(req, res) {
  const { code, language } = req.body;

  if (typeof code !== "string" || typeof language !== "string") {
    return res.status(400).json({ success: false, error: "Invalid input" });
  }

  if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
    return res.status(413).json({ success: false, error: "Code too large" });
  }

  try {
    let result;

    if (language === "javascript") {
      result = await runOnRunner("javascript", code);
    } else if (language === "python") {
      result = await runOnRunner("python", code);
    } else if (language === "cpp") {
      result = await runOnRunner("cpp", code);
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Unsupported language" });
    }

    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }

    return res.json({ success: true, output: result.output });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}

// 🔗 routes
app.post("/run-code", (req, res) => {
  void handleRun(req, res);
});

app.get("/", (_req, res) => {
  res.send("OK");
});

const server = http.createServer(app);
registerRoom(server);

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}...`);
});