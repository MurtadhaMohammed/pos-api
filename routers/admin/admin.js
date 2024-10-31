const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Register Admin
router.post("/register", async (req, res) => {
  const { name, username, password, type } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { name, type, username, password: hashedPassword },
    });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (admin && (await bcrypt.compare(password, admin.password))) {
      const token = jwt.sign(
        {
          id: admin.id,
          username: admin.username,
          type: admin.type,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({ message: "Login successful", token });
    } else {
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
