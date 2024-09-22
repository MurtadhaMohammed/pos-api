const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Card
router.post("/", adminAuth, async (req, res) => {
  const { price, providerId, cardTypeId, companyPrice } = req.body;
  try {
    const card = await prisma.card.create({
      data: { price, providerId, cardTypeId, companyPrice },
    });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all Cards
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const { type, id } = req?.user;
    const isProvider = type === "PROVIDER";
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip | 0);
    const where = isProvider
      ? {
          providerId: parseInt(id),
        }
      : {};

    const total = await prisma.card.count({ where });
    const cards = await prisma.card.findMany({
      where,
      include: {
        cardType: true,
        provider: true,
      },
      take,
      skip,
    });
    res.json({ data: cards, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Card by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const card = await prisma.card.findUnique({ where: { id: Number(id) } });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Card by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { price, providerId, cardTypeId, companyPrice } = req.body;
  try {
    const card = await prisma.card.update({
      where: { id: Number(id) },
      data: { price, providerId, cardTypeId, companyPrice },
    });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Card by ID
router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const card = await prisma.card.delete({ where: { id: Number(id) } });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
