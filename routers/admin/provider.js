const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

// insert Provider
router.post("/", adminAuth, async (req, res) => {
  const { name, phone, address, username, password } = req.body;

  try {
    // Hash the admin password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the admin account
    const admin = await prisma.admin.create({
      data: {
        name,
        username,
        password: hashedPassword,
        type: "PROVIDER",
      },
    });

    // Create the provider with the created admin account
    const provider = await prisma.provider.create({
      data: {
        name,
        phone,
        address,
        adminId: admin.id,
      },
    });

    res.status(201).json({ provider, admin });
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ error: "Error creating provider and admin account" });
  }
});

// Read all Providers
router.get("/", adminAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip | 0);
    const total = await prisma.provider.count();
    const providers = await prisma.provider.findMany({
      include: {
        admin: true,
      },
      take,
      skip,
    });
    res.json({ data: providers, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Provider by ID
router.get("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: Number(id) },
    });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Provider by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;
  try {
    const provider = await prisma.provider.update({
      where: { id: Number(id) },
      data: { name, phone, address },
    });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
