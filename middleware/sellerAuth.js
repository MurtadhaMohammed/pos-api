const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const sellerAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.includes("Bearer")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

module.exports = sellerAuth;
