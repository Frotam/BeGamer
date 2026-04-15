const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;



/*
============================
UTIL
============================
*/

function cleanup(dir) {

  fs.rm(dir, { recursive: true, force: true }, (err) => {

    if (err) {

      console.error("Cleanup error:", err);

    }

  });

}



/*
============================
C++ EXECUTION FUNCTION
============================
*/

function runCpp(code, res) {

  const runId = crypto.randomUUID();

  const runDir = path.join(__dirname, "temp", runId);

  fs.mkdirSync(runDir, { recursive: true });

  const filePath = path.join(runDir, "main.cpp");

  const exePath = path.join(runDir, "main");

  fs.writeFileSync(filePath, code);



  exec(

    `g++ "${filePath}" -o "${exePath}"`,

    (compileErr, _, compileStderr) => {

      if (compileErr) {

        cleanup(runDir);

        return res.json({

          success: false,

          stage: "compile",

          error: compileStderr

        });

      }



      exec(

        `"${exePath}"`,

        { timeout: 5000 },

        (runErr, stdout, runStderr) => {

          cleanup(runDir);



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

        }

      );

    }

  );

}



/*
============================
JS EXECUTION FUNCTION
============================
*/

function runJs(code, res) {

  const runId = crypto.randomUUID();

  const runDir = path.join(__dirname, "temp", runId);

  fs.mkdirSync(runDir, { recursive: true });

  const filePath = path.join(runDir, "main.js");

  fs.writeFileSync(filePath, code);



  exec(

    `node "${filePath}"`,

    { timeout: 5000 },

    (runErr, stdout, runStderr) => {

      cleanup(runDir);



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

    }

  );

}
function runPython(code, res) {

  const runId = crypto.randomUUID();

  const runDir = path.join(__dirname, "temp", runId);

  fs.mkdirSync(runDir, { recursive: true });

  const filePath = path.join(runDir, "main.py");

  fs.writeFileSync(filePath, code);



  exec(

    `python3 "${filePath}"`,

    { timeout: 5000 },

    (runErr, stdout, runStderr) => {

      cleanup(runDir);



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

    }

  );

}


/*
============================
SECURE IMPOSTER SELECTION
============================
*/

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

  console.log(`[IMPOSTER_SELECTION] Selected imposter: ${imposterId} from ${playerIds.length} players`);

  return res.json({
    success: true,
    imposterId: imposterId,
    timestamp: Date.now()
  });
});

/*
============================
MAIN ROUTE
============================
*/

app.post("/run-code", (req, res) => {

  const { code, language } = req.body;



  console.log("language:", language);



  if (!code || !language) {

    return res.status(400).json({

      success: false,

      error: "code or language missing"

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




/*
============================
START SERVER
============================
*/

app.listen(PORT, () => {

  console.log(`Server running on port ${PORT}`);

});