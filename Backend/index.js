const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

app.post("/run-cpp", (req, res) => {

  let code = req.body.code;

  // unique folder per execution
  const runId = crypto.randomUUID();

  const runDir = path.join(__dirname, "temp", runId);

  fs.mkdirSync(runDir, { recursive: true });

  const filePath = path.join(runDir, "main.cpp");
  const exePath = path.join(runDir, "main");

  fs.writeFileSync(filePath, code);

  exec(`g++ "${filePath}" -o "${exePath}"`,
    (compileErr, _, compileStderr) => {

      if (compileErr) {

        cleanup(runDir);

        return res.json({
          success: false,
          stage: "compile",
          error: compileStderr
        });

      }

      exec(`"${exePath}"`, { timeout: 5000 },
        (runErr, stdout, runStderr) => {

          cleanup(runDir); // delete after execution

          if (runErr) {

            return res.json({
              success: false,
              stage: "runtime",
              error: runStderr || runErr.message
            });

          }

          res.json({
            success: true,
            output: stdout
          });

        });

    });

});

function cleanup(dir) {

  fs.rm(dir, { recursive: true, force: true }, (err) => {

    if (err) {

      console.error("cleanup error:", err);

    }

  });

}