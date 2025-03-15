const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

// Create Plan
router.post("/", adminAuth, async (req, res) => {
  const { image, title } = req.body;
  try {
    const plan = await prisma.plan.create({
      data: { image, title },
    });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all plans
router.get("/", providerAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const q = req.query.q || "";

    const where = q
      ? {
          title: {
            contains: q,
            mode: "insensitive",
          },
        }
      : {};

    const total = await prisma.plan.count({ where });

    const plans = await prisma.plan.findMany({
      where,
      take,
      skip,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ data: plans, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Plan by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { image, title } = req.body;
  try {
    const plan = await prisma.plan.update({
      where: { id: Number(id) },
      data: { image, title },
    });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  try {
    const plans = await prisma.plan.update({
      where: { id: Number(id) },
      data: { active },
    });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Plan by ID
router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const plan = await prisma.plan.update({
      where: { id: Number(id) },
      data: { hidden: true },
    });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
