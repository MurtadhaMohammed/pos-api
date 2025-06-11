const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const permissons = require("../../constants/permissons.json");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Register Admin
// router.post("/register", async (req, res) => {
//   const { name, username, password, type } = req.body;
//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const admin = await prisma.admin.create({
//       data: { name, type, username, password: hashedPassword },
//     });
//     res.json(admin);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Register Admin
router.post("/reset", adminAuth, async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.update({
      where: { username },
      data: { password: hashedPassword },
    });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login Admin
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await prisma.admin.findUnique({
      where: { username },
      include: { provider: true },
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (admin.provider && !admin.provider.active) {
      return res.status(403).json({ error: "Provider account is not active" });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Generate JWT Token
    const tokenPayload = {
      id: admin.id,
      username: admin.username,
      type: admin.type,
      providerId: admin?.provider?.id,
      permissons: admin.permissons || {},
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "1h" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/permissons", async (req, res) => {
  try {
    res.status(200).json(permissons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
