const express = require("express");
const router = express.Router();
const {
  emaillogin,
  userData,
  verify,
  session,
  reguser,
  settings,
} = require("../controllers/userController");

// Auth routes
router.post("/email-login", emaillogin);
router.post("/verify-login", verify);
router.post("/session-check", session);
router.post("/user-data", reguser);
router.post("/user-provider", userData);
router.post("/settings", settings);

module.exports = router;
