const express = require("express");
const { agent, handleAgent } = require("../controllers/agent");
const clonerAgentRoutes = require("../controllers/clonerAgent");

const router = express.Router();

router.post("/agent", handleAgent);

// router.post("/cloner-agent", clonerAgentRoutes);

// router.post("/cloner-agent", clonerAgentRoutes.analyze);

module.exports = router;
