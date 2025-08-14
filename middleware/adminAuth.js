const jwt = require("jsonwebtoken");
const prisma = require("../prismaClient");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const adminAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err, user) => {
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

    let admin = await prisma.admin.findUnique({
      where: {
        id: parseInt(user?.id),
      },
    });

    if (!admin) {
      return res.status(403).json({ error: "Admin not found" });
    }

    req.user = { ...user, permissions: admin?.permissions || [] };

    next();
  });
};

module.exports = adminAuth;
