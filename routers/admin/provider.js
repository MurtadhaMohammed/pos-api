const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const adminAuth = require("../../middleware/adminAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
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

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;

  try{
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id) },
    })

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const updatedProvider = await prisma.provider.update({
      where: { id: parseInt(id) },
      data: {
        active: !provider.active,
      }
    })

    res.json(updatedProvider)
  }catch(error){
    res.status(500).json({ error: error.message });
  }
});

router.put("/reset-password/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id)},
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const providerAdmin = provider.adminId;

    const updatedAdmin = await prisma.admin.update({
      where: {id: parseInt(providerAdmin)},
      data: { password: hashedPassword },
    });
    console.log(updatedAdmin)

    res.json({
      message: "Password updated successfully",
      provider: updatedAdmin,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: "Error updating password" + error.message });
  }
});

// so the provider can see his data in about section
router.get("/about/:id", dashboardAuth, async (req, res) => {

  const providerId = req.params.id;
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(providerId) },
    });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }

});


module.exports = router;
