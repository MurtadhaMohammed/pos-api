const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const providerAuth = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ error: "JWT token has expired" });
      }
      return res.sendStatus(403);
    }

    if (!["PROVIDER", "ADMIN"].includes(decodedUser.type)) {
      return res.status(403).json({ error: "Access denied (invalid role)" });
    }

    try {
      const user = await prisma.admin.findFirst({
        where: {
          id: decodedUser.id,
          type: decodedUser.type, 
        },
        include: { provider: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found!" });
      }

      if (user.type === "PROVIDER" && (!user.provider || !user.provider.active)) {
        return res.status(403).json({ error: "Provider account is not active" });
      }

      req.user = decodedUser;
      next();
    } catch (dbError) {
      console.error("Database error:", dbError);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};

module.exports = providerAuth;
