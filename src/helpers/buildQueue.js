const { Queue } = require("bullmq");

// Create build queue
const buildQueue = new Queue("build-queue3", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

const addToBuildQueue = async (data, options = {}) => {
  try {
    // Check if a job with the same projectId already exists
    const existingJob = await findJobByProjectId(data.projectId);

    if (existingJob) {
      console.log(
        `Job with projectId ${data.projectId} already exists in queue with ID: ${existingJob.id}`
      );
      return { exists: true, job: existingJob };
    }

    const job = await buildQueue.add("build", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
      ...options,
    });

    console.log(`Job added to build queue with ID: ${job.id}`);
    return { exists: false, job };
  } catch (error) {
    console.error("Error adding job to build queue:", error);
    throw error;
  }
};

const findJobByProjectId = async (projectId) => {
  try {
    // Check waiting jobs
    const waitingJobs = await buildQueue.getWaiting();
    for (const job of waitingJobs) {
      if (job.data.projectId === projectId) {
        return job;
      }
    }

    // Check active jobs
    const activeJobs = await buildQueue.getActive();
    for (const job of activeJobs) {
      if (job.data.projectId === projectId) {
        return job;
      }
    }

    // Check delayed jobs
    const delayedJobs = await buildQueue.getDelayed();
    for (const job of delayedJobs) {
      if (job.data.projectId === projectId) {
        return job;
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding job by projectId:", error);
    return null;
  }
};

module.exports = {
  buildQueue,
  addToBuildQueue,
  findJobByProjectId,
};
