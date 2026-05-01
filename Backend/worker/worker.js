const { Worker } = require("bullmq");

const connection = {
  host: "localhost",
  port: 5002,
  maxRetriesPerRequest: null,
};

const worker = new Worker(
  "code-runner",
  async (job) => {
    console.log("Preparing job:", job.id);

    await new Promise((res) => setTimeout(res, 400));

    console.log("Ready:", job.data);

    return "done"; // important (BullMQ uses return value)
  },
  { connection }
);

// events
worker.on("completed", (job) => {
  console.log("Job completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("Job failed:", job?.id, err);
});