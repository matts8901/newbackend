const express = require("express");
const {
  dlogin,
  sendOtp,
  resetpass,
  subusercheck,
  getusers,
  userstatus,
  adduser,
  doverview,
  authmethods,
  dlogs,
  addDB,
  getDB,
  updateDB,
  deleteDB,
  checkproject,
  verifyotp,
  getdata,
  checkuser,
  getinternalDB,
} = require("../controllers/dashboard");

const router = express.Router();

//login
router.post("/d/login", dlogin);
router.post("/d/sendotp", sendOtp);
router.post("/d/verifyotp", verifyotp);
router.post("/d/user-check", subusercheck);
router.post("/d/check", checkproject);
router.post("/d/resetpass", resetpass);

//user
router.post("/d/getusers", getusers);
router.post("/d/userstatus", userstatus);
router.post("/d/adduser", adduser);
router.post("/d/checkuser", checkuser);

//overview
router.post("/d/overview", doverview);
router.post("/d/authmethods", authmethods);
router.post("/d/logs", dlogs);

//DB
router.post("/d/getdb", getDB);
router.post("/d/getinternalDB", getinternalDB);
router.post("/d/add", addDB);
router.post("/d/getdata", getdata);
router.post("/d/update", updateDB);
router.post("/d/delete", deleteDB);

module.exports = router;
