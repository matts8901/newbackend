const planValidator = (req, res, next) => {
  const { plan } = req.body;
  const validPlans = ["free", "scale"];

  if (!validPlans.includes(plan)) {
    return res.status(400).json({
      success: false,
      message: "Invalid plan selected. Please choose a valid plan.",
    });
  }

  next();
};

module.exports = { planValidator };
