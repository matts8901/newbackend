const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const cookieParser = require("cookie-parser");

const morgan = require("morgan");
const { MONGO_URI, PORT } = require("./config");

const userRoutes = require("./routes/userRoutes");
const projectRoutes = require("./routes/Project");
const SubsRoutes = require("./routes/subscriptionRoutes");
const AgentRoutes = require("./routes/agent");
const dashboardRoutes = require("./routes/dashboard");

// Initialize Express App
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(
  express.urlencoded({
    limit: "100mb",
    extended: true,
    parameterLimit: 100000, // protects against too many URL params
  })
);
app.use(cookieParser());
app.use(morgan("dev"));

// Routes
app.use("/api", userRoutes);
app.use("/api", projectRoutes);
app.use("/api", AgentRoutes);
app.use("/api", SubsRoutes);
app.use("/api", dashboardRoutes);

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log(" Connected to MongoDB"))
  .catch((err) => console.error(" MongoDB Connection Error:", err));

// Start Server
app.listen(PORT, () =>
  console.log(` Server running on http://localhost:${PORT}`)
);
