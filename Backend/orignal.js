const express = require("express");
const cors = require("cors");
const http = require("http");
const { spawn } = require("child_process");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const registerRoom = require("./websocket");
const { createClient } = require("redis");
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
 
const client = createClient({
  url: "redis://redis:6379",
});

async function initRedis() {
  try {
    await client.connect();

    await client.set("test", "hello");
    console.log(await client.get("test")); // should print "hello"

  } catch (err) {
    console.error("Redis error:", err);
  }
}

initRedis();




const PORT = Number(process.env.PORT) || 5001;
const RUN_TIMEOUT_MS = 5000;
const MAX_CODE_BYTES = 100 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const DOCKER_CPP_IMAGE = process.env.DOCKER_CPP_IMAGE || "begameer-cpp-runner";
const CPP_DOCKERFILE = path.join(process.cwd(), "Dockerfile.cpp");

let cppImageReadyPromise = null;

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: error.message || stderr,
      });
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });
}

async function ensureCppImage() {
  if (cppImageReadyPromise) {
    return cppImageReadyPromise;
  }

  cppImageReadyPromise = (async () => {
    const inspectResult = await runCommand("docker", [
      "image",
      "inspect",
      DOCKER_CPP_IMAGE,
    ]);

    if (inspectResult.ok) {
      return;
    }

    if (!fs.existsSync(CPP_DOCKERFILE)) {
      throw new Error("Dockerfile.cpp not found");
    }

    const buildResult = await runCommand("docker", [
      "build",
      "-f",
      CPP_DOCKERFILE,
      "-t",
      DOCKER_CPP_IMAGE,
      process.cwd(),
    ]);

    if (!buildResult.ok) {
      const message =
        buildResult.stderr.trim() || buildResult.stdout.trim() || "Unknown error";
      throw new Error(`Failed to build ${DOCKER_CPP_IMAGE}: ${message}`);
    }
  })();

  try {
    await cppImageReadyPromise;
  } catch (error) {
    cppImageReadyPromise = null;
    throw error;
  }
}

function runDocker({ image, cmd, stdin }) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "run",
      "--rm",
      "-i",
      "--network=none",
      "--cpus=0.5",
      "--memory=256m",
      "--pids-limit=64",
      "--security-opt",
      "no-new-privileges",
      "--cap-drop=ALL",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,size=64m",
      "--tmpfs",
      "/workspace:rw,exec,size=64m,uid=1000,gid=1000,mode=700",
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

    child.stdout.on("data", (chunk) => {
      output = collect(chunk, output);
    });

    child.stderr.on("data", (chunk) => {
      error = collect(chunk, error);
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve({
        success: false,
        error: "Docker not available",
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          success: false,
          error: "Timeout or output limit exceeded",
        });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          error: error || "Execution failed",
        });
        return;
      }

      resolve({ success: true, output });
    });

    if (typeof stdin === "string") {
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

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
      result = await runDocker({
        image: "node:20-alpine",
        cmd: ["sh", "-c", "cat > main.js && node main.js"],
        stdin: code,
      });
    } else if (language === "python") {
      result = await runDocker({
        image: "python:3.11-alpine",
        cmd: ["sh", "-c", "cat > main.py && python3 main.py"],
        stdin: code,
      });
    } else if (language === "cpp") {
      await ensureCppImage();
      result = await runDocker({
        image: DOCKER_CPP_IMAGE,
        cmd: [
          "sh",
          "-c",
          "cat > main.cpp && g++ main.cpp -O2 -std=c++17 -o main && ./main",
        ],
        stdin: code,
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
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
app.get("/test-redis", async (req, res) => {
  try {
    await client.set("test", "hello");
    const value = await client.get("test");
    res.json({ value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/run-code", (req, res) => {
  void handleRun(req, res);
});

app.get("/", (_req, res) => {
  res.send("OK");
});

const server = http.createServer(app);
registerRoom(server);

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
