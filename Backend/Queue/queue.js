const { Queue } = require("bullmq");

const connection = {
  host: "localhost", // or "redis" if Docker
  port: 5002,
};

const queue = new Queue("burger", { connection });

(async () => {
  await queue.add("make-burger", {
    test: 1,
    test2: 2,
  });
})();
const express = require("express");
const { Queue } = require("bullmq");

const app = express();
app.use(express.json());

 
const connection = {
  host: "localhost",   // use "redis" if running inside Docker
  port: 5002,
  maxRetriesPerRequest: null,
};

// 🧾 Create queue
const codeQueue = new Queue("code-runner", { connection });

 
app.get("/add-job", async (req, res) => {
  try {
    const job = await codeQueue.add("run-code", {
      code: "console.log('Hello World')",
    });

    res.json({
      message: "Job added",
      jobId: job.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

 
app.get("/", (req, res) => {
  res.send("Server running");
});

app.listen(5001, () => {
  console.log("Server running on 5001");
});