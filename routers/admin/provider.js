const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const adminAuth = require("../../middleware/adminAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();
const FormData = require("form-data");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

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
      orderBy: {
        createtAt: "desc",
      },
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

  try {
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id) },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const updatedProvider = await prisma.provider.update({
      where: { id: parseInt(id) },
      data: {
        active: !provider.active,
      },
    });

    res.json(updatedProvider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/reset-password/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id) },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const providerAdmin = provider.adminId;

    const updatedAdmin = await prisma.admin.update({
      where: { id: parseInt(providerAdmin) },
      data: { password: hashedPassword },
    });
    console.log(updatedAdmin);

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

router.get("/summary/:id", dashboardAuth, async (req, res) => {
  const providerId = req.params.id;

  if (!providerId) {
    return res.status(400).json({ error: "Provider ID is required" });
  }

  try {
    const cards = await prisma.card.findMany({
      where: {
        providerId: Number(providerId),
      },
      select: {
        id: true,
        cardType: {
          select: {
            companyCardID: true,
          },
        },
      },
    });

    const companyCardIds = Array.from(
      new Set(cards.map((card) => card.cardType.companyCardID))
    );

    if (companyCardIds.length === 0) {
      return res.status(404).json({ error: "No cards found for the provider" });
    }

    const formData = new FormData();
    formData.append("companyCardIds", JSON.stringify(companyCardIds));

    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/v1/client/card-summary",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formData,
      }
    );



    if (!response.ok) {
      const errorText = await response.text();
      return res
        .status(response.status)
        .json({ error: `External API error: ${errorText}` });
    }

    const externalResponseData = await response.json();

    res.status(200).json({
      message: "Summary fetched successfully",
      data: externalResponseData,
    });
  } catch (error) {
    console.error("Error fetching card summary:", error.message);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the summary" });
  }
});

router.put("/update-price/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { providerPrice } = req.body;
  const provider = req?.user;

  if (provider?.type == !"PROVIDER") {
    return res.status(500).json({ error: "user not provider" });
  }

  const providerId = provider.id;

  try {
    const card = await prisma.card.findUnique({ where: { id: parseInt(id) } });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    if (card.providerId !== null && card.providerId !== providerId) {
      return res
        .status(400)
        .json({ error: "Provider ID does not match the card's provider" });
    }

    const updatedCard = await prisma.card.update({
      where: { id: parseInt(id) },
      data: { price: providerPrice },
    });

    res.json({ message: "Provider price updated successfully", updatedCard });
  } catch (error) {
    console.error("Error updating provider price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
