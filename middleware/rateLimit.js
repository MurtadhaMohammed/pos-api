const rateLimit = require("express-rate-limit");

// Limit: max 5 requests per 15 minutes
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: "Too many requests, please try again after 15 minutes.",
  },
});

module.exports = { otpLimiter };
