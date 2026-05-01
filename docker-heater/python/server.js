const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const RUN_TIMEOUT_MS = 5000;
const MAX_OUTPUT = 64 * 1024;

app.post("/run", async (req, res) => {
  const { code } = req.body;

  if (typeof code !== "string") {
    return res.status(400).json({ success: false, error: "Invalid code" });
  }

  // 🔒 isolate execution
  const dir = path.join("/tmp", `run-${Date.now()}-${Math.random()}`);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const filePath = path.join(dir, "main.py");
    fs.writeFileSync(filePath, code);

    const run = spawn("python3", [filePath], {
      cwd: dir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let error = "";
    let killed = false;

    // ⏱ timeout
    const timer = setTimeout(() => {
      killed = true;
      run.kill("SIGKILL");
    }, RUN_TIMEOUT_MS);

    // 📦 output limit
    run.stdout.on("data", (data) => {
      output += data.toString();
      if (output.length > MAX_OUTPUT) {
        killed = true;
        run.kill("SIGKILL");
      }
    });

    run.stderr.on("data", (data) => {
      error += data.toString();
    });

    run.on("close", () => {
      clearTimeout(timer);
      cleanup(dir);

      if (killed) {
        return res.json({
          success: false,
          error: "Timeout or output too large",
        });
      }

      if (error) {
        return res.json({ success: false, error });
      }

      res.json({ success: true, output });
    });
  } catch (err) {
    cleanup(dir);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🧹 cleanup
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

app.listen(3000, () => {
  console.log("Secure Python runner ready");
});