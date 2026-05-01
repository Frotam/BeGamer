const express = require("express");
const cors = require("cors");
const http = require("http");
const rateLimit = require("express-rate-limit");
const registerRoom = require("./websocket");
const { Queue } = require("bullmq");
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

// ✅ correct Redis config (Render)
const connection = {
  url: process.env.REDIS_URL,
};

// ✅ create queue ONCE
const queue = new Queue("code-runner", { connection });

app.post("/run-code", async (req, res) => {
  const { code, language } = req.body;

  const job = await queue.add("run-code", {
    code,
    language,
  });

  res.json({ jobId: job.id });
});

app.get("/", (_req, res) => {
  res.send("OK");
});

const server = http.createServer(app);
registerRoom(server);

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}...`);
});