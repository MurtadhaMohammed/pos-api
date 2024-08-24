const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const adminAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ error: "JWT token has expired" });
      } else {
        return res.sendStatus(403);
      }
    } else if (user.type !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
    }
    req.user = user;
    next();
  });
};

module.exports = adminAuth;
