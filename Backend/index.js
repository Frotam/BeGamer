const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
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
  }),
);

const PORT = Number(process.env.PORT) || 5001;
const RUN_TIMEOUT_MS = 5000;
const MAX_CODE_BYTES = 100 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const BASE_TEMP = path.join(process.cwd(), "temp");

function createRunDir() {
  const id = crypto.randomUUID();
  const dir = path.join(BASE_TEMP, id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function cleanup(dir) {
  fs.rm(dir, { recursive: true, force: true }, () => {});
}

function writeFile(dir, name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

function runDocker({ image, cmd, cwd }) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "run",
      "--rm",
      "--network=none",
      "--cpus=0.5",
      "--memory=256m",
      "--pids-limit=64",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,size=64m",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop=ALL",
      "-u",
      "1000:1000",
      "-v",
      `${cwd}:/workspace:ro`,
      "-w",
      "/workspace",
      image,
      ...cmd,
    ]);

    let output = "";
    let error = "";
    let bytes = 0;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);

    const collect = (chunk, target) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        killed = true;
        child.kill("SIGKILL");
        return target;
      }
      return target + chunk.toString();
    };

    child.stdout.on("data", (c) => {
      output = collect(c, output);
    });

    child.stderr.on("data", (c) => {
      error = collect(c, error);
    });

    child.on("error", () => {
      clearTimeout(timer);
      return resolve({
        success: false,
        error: "Docker not installed or not available",
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (killed) {
        return resolve({
          success: false,
          error: "Timeout or output limit exceeded",
        });
      }

      if (code !== 0) {
        return resolve({ success: false, error: error || "Execution failed" });
      }

      return resolve({ success: true, output });
    });
  });
}
async function handleRun(req, res) {
  const { code, language } = req.body;

  if (typeof code !== "string" || !language) {
    return res.status(400).json({ success: false, error: "Invalid input" });
  }

  if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
    return res.status(413).json({ success: false, error: "Code too large" });
  }

  const runDir = createRunDir();

  try {
    let result;

    if (language === "javascript") {
      writeFile(runDir, "main.js", code);
      result = await runDocker({
        image: "node:20-alpine",
        cmd: ["node", "main.js"],
        cwd: runDir,
      });
    } else if (language === "python") {
      writeFile(runDir, "main.py", code);
      result = await runDocker({
        image: "python:3.11-alpine",
        cmd: ["python3", "main.py"],
        cwd: runDir,
      });
    } else if (language === "cpp") {
      writeFile(runDir, "main.cpp", code);
      result = await runDocker({
        image: "gcc:13",
        cmd: ["sh", "-c", "g++ main.cpp -O0 -std=c++17 -o main && ./main"],
        cwd: runDir,
      });
    } else {
      return res
        .status(400)
        .json({ success: false, error: "Unsupported language" });
    }

    if (!result.success) {
      return res.json({ success: false, error: result.error });
    }

    return res.json({ success: true, output: result.output });
  } finally {
    cleanup(runDir);
  }
}

app.post("/run-code", (req, res) => {
  void handleRun(req, res);
});

app.get("/", (_req, res) => {
  res.send("hello");
});

const server = http.createServer(app);
registerRoom(server);

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

server.on("error", (err) => {
  console.error(`Server failed to start on port ${PORT}:`, err.message);
  process.exit(1);
});
