const jwt = require("jsonwebtoken");
const prisma = require("../../../prismaClient");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

const providerAuth = async (req, res, next) => {
  
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  console.log("Auth header:", authHeader);
  console.log("Token:", token ? "Present" : "Missing");
  
  if (!token) {
    console.log("No token found, returning 401");
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, async (err, decodedUser) => {
    if (err) {
      console.log("JWT verification failed:", err.message);
      if (err.name === "TokenExpiredError") {
        return res.status(403).json({ error: "JWT token has expired" });
      }
      return res.sendStatus(403);
    }

    console.log("JWT decoded successfully:", decodedUser);

    if (decodedUser.type !== "PROVIDER") {
      return res.status(403).json({ error: "Access denied (only providers allowed)" });
    }

    try {
      const user = await prisma.admin.findFirst({
        where: {
          id: decodedUser.id,
          type: "PROVIDER"
        },
        include: { provider: true },
      });


      if (!user) {
        console.log("Provider not found in database");
        return res.status(404).json({ error: "Provider not found!" });
      }

      if (!user.provider || !user.provider.active) {
        console.log("Provider account is not active");
        return res.status(403).json({ error: "Provider account is not active" });
      }

      req.user = {
        ...decodedUser,
        providerId: user.provider.id
      };
      next();
    } catch (dbError) {
      console.error("Database error:", dbError);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};

module.exports = providerAuth;
