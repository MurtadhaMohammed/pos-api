const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const dashboardAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401); 

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ error: "JWT token has expired" });
      } else {
        return res.sendStatus(403);
      }
    }

    if (user.type === "PROVIDER" && !user.active) {
      return res.status(403).json({ error: "Provider account is not active" });
    }

    req.user = user;
    next();
  });
};

module.exports = dashboardAuth;
