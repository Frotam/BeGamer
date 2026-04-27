const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const registerRoom = require("./wss/Main");
require("dotenv").config();
const app = express();

app.use(cors());
app.use(express.json({ limit: "128kb" }));

const PORT = Number(process.env.PORT) || 5000;
const COMPILE_TIMEOUT_MS = 7000;
const RUN_TIMEOUT_MS = 5000;
const MAX_CODE_BYTES = 100 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const DOCKER_WORKDIR = "/workspace";
const CPP_DOCKER_IMAGE = process.env.DOCKER_CPP_IMAGE || "begameer-cpp-runner";
const JS_DOCKER_IMAGE = process.env.DOCKER_JS_IMAGE || "begameer-js-runner";
const PYTHON_DOCKER_IMAGE = process.env.DOCKER_PYTHON_IMAGE || "begameer-python-runner";

("got the req")


function cleanup(dir) {

  fs.rm(dir, { recursive: true, force: true }, (err) => {

    if (err) {

      console.error("Cleanup error:", err);

    }

  });

}

function createRunDir() {
  const runId = crypto.randomUUID();
  const runDir = path.join(__dirname, "temp", runId);

  fs.mkdirSync(runDir, { recursive: true });

  return runDir;
}

function writeSourceFile(runDir, fileName, code) {
  const filePath = path.join(runDir, fileName);

  fs.writeFileSync(filePath, code);

  return filePath;
}

function stopChild(child) {
  if (child.killed) {
    return;
  }

  const pid = child.pid;

  try {
    if (pid) {
      process.kill(-pid, "SIGTERM");
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    child.kill("SIGTERM");
  }

  setTimeout(() => {
    if (child.killed) {
      return;
    }

    try {
      if (pid) {
        process.kill(-pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    } catch {
      child.kill("SIGKILL");
    }
  }, 1000).unref();
}

function runCommand(command, args, options = {}) {
  const {
    cwd,
    timeoutMs = RUN_TIMEOUT_MS,
    stage = "runtime",
    onTimeout
  } = options;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;

    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      stopChild(child);
    }, timeoutMs);

    function collectOutput(chunk, target) {
      outputBytes += chunk.length;

      if (outputBytes > MAX_OUTPUT_BYTES) {
        outputLimitExceeded = true;
        stopChild(child);
        return target;
      }

      return target + chunk.toString();
    }

    child.stdout.on("data", (chunk) => {
      stdout = collectOutput(chunk, stdout);
    });

    child.stderr.on("data", (chunk) => {
      stderr = collectOutput(chunk, stderr);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stage,
        error: err.message
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);

      if (timedOut) {
        return resolve({
          success: false,
          stage,
          error: `${stage} timed out after ${timeoutMs / 1000} seconds`
        });
      }

      if (outputLimitExceeded) {
        return resolve({
          success: false,
          stage,
          error: `Output limit exceeded (${MAX_OUTPUT_BYTES / 1024} KB)`
        });
      }

      if (code !== 0) {
        return resolve({
          success: false,
          stage,
          error: stderr || `Process exited with code ${code}${signal ? ` (${signal})` : ""}`
        });
      }

      return resolve({
        success: true,
        output: stdout,
        stderr
      });
    });
  });
}

function removeDockerContainer(containerName) {
  const cleanupChild = spawn("docker", ["rm", "-f", containerName], {
    stdio: "ignore"
  });

  cleanupChild.on("error", () => {});
}

function buildDockerRunArgs({ containerName, image, runDir, command }) {
  return [
    "run",
    "--rm",
    "--name",
    containerName,
    "-v",
    `${path.resolve(runDir)}:${DOCKER_WORKDIR}`,
    "-w",
    DOCKER_WORKDIR,
    image,
    "sh",
    "-lc",
    command
  ];
}

function runDockerCommand({ image, runDir, command, timeoutMs, stage }) {
  const containerName = `begameer-${stage}-${crypto.randomUUID()}`;

  return runCommand(
    "docker",
    buildDockerRunArgs({
      containerName,
      image,
      runDir,
      command
    }),
    {
      timeoutMs,
      stage,
      onTimeout: () => removeDockerContainer(containerName)
    }
  );
}

function sendRunError(res, result) {
  return res.json({
    success: false,
    stage: result.stage,
    error: result.error
  });
}

async function runCpp(code, res) {

  const runDir = createRunDir();
  
  try {

    writeSourceFile(runDir, "main.cpp", code);
    const runResult = await runDockerCommand({
      image: CPP_DOCKER_IMAGE,
      runDir,
      command: "g++ main.cpp -O0 -std=c++17 -o main && ./main",
      timeoutMs: COMPILE_TIMEOUT_MS + RUN_TIMEOUT_MS,
      stage: "cpp"
    });

    if (!runResult.success) {
      return sendRunError(res, runResult);
    }

    return res.json({

      success: true,
      output: runResult.output

    });

  }
  finally {

    cleanup(runDir);

  }

}


// js

async function runJs(code, res) {

  const runDir = createRunDir();
  try {

    writeSourceFile(runDir, "main.js", code);
    const runResult = await runDockerCommand({
      image: JS_DOCKER_IMAGE,
      runDir,
      command: "node main.js",
      timeoutMs: RUN_TIMEOUT_MS,
      stage: "javascript"
    });

    if (!runResult.success) {

      return sendRunError(res, runResult);

    }

    return res.json({

      success: true,
      output: runResult.output

    });

  }
  finally {

    cleanup(runDir);

  }

}

async function runPython(code, res) {

  const runDir = createRunDir();
  try {

    writeSourceFile(runDir, "main.py", code);
    const runResult = await runDockerCommand({
      image: PYTHON_DOCKER_IMAGE,
      runDir,
      command: "python3 main.py",
      timeoutMs: RUN_TIMEOUT_MS,
      stage: "python"
    });

    if (!runResult.success) {

      return sendRunError(res, runResult);

    }

    return res.json({

      success: true,
      output: runResult.output

    });

  }
  finally {

    cleanup(runDir);

  }

}




app.post("/select-imposter", (req, res) => {
  const { playerIds } = req.body;

  // Server-side validation
  if (!Array.isArray(playerIds) || playerIds.length < 1) {
    return res.status(400).json({
      success: false,
      error: "Invalid playerIds: must be a non-empty array"
    });
  }

  // Cryptographically secure random selection using crypto module
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  const selectedIndex = randomValue % playerIds.length;
  const imposterId = playerIds[selectedIndex];

  // Validate that selected ID is in the list (always true, but good practice)
  if (!playerIds.includes(imposterId)) {
    return res.status(500).json({
      success: false,
      error: "Failed to select valid imposter"
    });
  }

  (`[IMPOSTER_SELECTION] Selected imposter: ${imposterId} from ${playerIds.length} players`);

  return res.json({
    success: true,
    imposterId: imposterId,
    timestamp: Date.now()
  });
});


app.post("/run-code", (req, res) => {

  const { code, language } = req.body;



  ("language:", language);



  if (typeof code !== "string" || !language) {

    return res.status(400).json({

      success: false,

      error: "code or language missing"

    });

  }

  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {

    return res.status(413).json({

      success: false,

      error: `Code is too large. Maximum allowed size is ${MAX_CODE_BYTES / 1024} KB`

    });

  }



  if (language === "cpp") {
  
    return runCpp(code, res);

  }
  if (language === "javascript") {

    return runJs(code, res);

  }
  if (language === "python") {

    return runPython(code, res);
  }
  return res.status(400).json({

    success: false,

    error: "Unsupported language"

  });

});

app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error: "Request body is too large"
    });
  }

  console.error("Unhandled server error:", err);

  return res.status(500).json({
    success: false,
    error: "Internal server error"
  });
});
app.get("/", (req, res) => {
  res.send("hello");
});

const server = http.createServer(app);

registerRoom(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on("error", (err) => {
  console.error(`Server failed to start on port ${PORT}:`, err.message);
  process.exit(1);
});
