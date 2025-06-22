const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const dashboardAuth = async (req, res, next) => {
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

    try {
      const admin = await prisma.admin.findUnique({
        where: { id: decodedUser.id, username: decodedUser.username },
        select: { id: true, username: true, type: true },
      });

      if (!admin) {
        return res.status(404).json({ error: "User not found!" });
      }

      if (admin.type === "PROVIDER") {
        const provider = await prisma.provider.findUnique({
          where: { adminId: admin.id },
          select: { id: true, active: true },
        });

        if (!provider || !provider.active) {
          return res
            .status(403)
            .json({ error: "Provider account is not active" });
        }
      }

      req.user = { ...decodedUser, permissions: admin?.permissions || [] };
      next();
    } catch (dbError) {
      console.error("Database error:", dbError);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};

module.exports = dashboardAuth;
