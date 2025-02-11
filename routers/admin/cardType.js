const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

// Create CardType
router.post("/", adminAuth, async (req, res) => {
  const { image, name, companyCardID } = req.body;
  try {
    const cardType = await prisma.cardType.create({
      data: { image, name, companyCardID },
    });
    res.json(cardType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all CardTypes
router.get("/", adminAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const q = req.query.q || "";

    const where = q
      ? {
          name: {
            contains: q,
            mode: "insensitive",
          },
        }
      : {};

    const total = await prisma.cardType.count({ where });

    const cardTypes = await prisma.cardType.findMany({
      where,
      take,
      skip,
      orderBy: {
        name: "asc",
      },
    });

    res.json({ data: cardTypes, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read CardType by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const cardType = await prisma.cardType.findUnique({
      where: { id: Number(id) },
    });
    res.json(cardType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update CardType by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { image, name, companyCardID } = req.body;
  try {
    const cardType = await prisma.cardType.update({
      where: { id: Number(id) },
      data: { image, name, companyCardID },
    });
    res.json(cardType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  try {
    const cardType = await prisma.cardType.update({
      where: { id: Number(id) },
      data: { active },
    });
    res.json(cardType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete CardType by ID
router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const cardType = await prisma.cardType.delete({
      where: { id: Number(id) },
    });
    res.json(cardType);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
