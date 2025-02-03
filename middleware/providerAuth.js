const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const providerAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401); 

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ error: "JWT token has expired" });
      }
      return res.sendStatus(403); 
    }

    if (user.type !== "ADMIN" && user.type !== "PROVIDER") {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }

    if (user.type === "PROVIDER" && !user.active) {
      return res.status(403).json({ error: "Provider account is not active" });
    }

    req.user = user;
    next();
  });
};

module.exports = providerAuth;
