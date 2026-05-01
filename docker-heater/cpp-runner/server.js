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

  // 🔒 isolate per request
  const dir = path.join("/tmp", `run-${Date.now()}-${Math.random()}`);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const cppPath = path.join(dir, "main.cpp");
    const outPath = path.join(dir, "main");

    fs.writeFileSync(cppPath, code);

    // ⚙️ compile step
    const compile = spawn("g++", [
      cppPath,
      "-O2",
      "-std=c++17",
      "-o",
      outPath,
    ], { cwd: dir });

    let compileErr = "";

    compile.stderr.on("data", (data) => {
      compileErr += data.toString();
    });

    compile.on("close", (code) => {
      if (code !== 0) {
        cleanup(dir);
        return res.json({
          success: false,
          error: compileErr || "Compilation failed",
        });
      }

      // ▶️ run step
      const run = spawn(outPath, [], { cwd: dir });

      let output = "";
      let error = "";
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        run.kill("SIGKILL");
      }, RUN_TIMEOUT_MS);

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
    });
  } catch (err) {
    cleanup(dir);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🧹 cleanup temp files
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

app.listen(3000, () => {
  console.log("Secure CPP runner ready");
});