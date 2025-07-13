const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const sellerAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.includes("Bearer")
    ? authHeader.split(" ")[1]
    : authHeader;
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.sendStatus(403);

    const jti = decoded?.jti;
    if (jti) {
      const isBlacklisted = await prisma.blocklist.findUnique({
        where: { jti },
      });

      if (isBlacklisted)
        return res.status(401).json({ error: "Token revoked" });
    }
    req.user = decoded;
    next();
  });
};

module.exports = sellerAuth;
