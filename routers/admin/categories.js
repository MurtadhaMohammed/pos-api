const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

// Create Plan
router.post("/", adminAuth, async (req, res) => {
  const { image, title, priority } = req.body;
  try {
    const category = await prisma.category.create({
      data: { image, title, priority },
    });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all category
router.get("/", adminAuth, async (req, res) => {
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

    const total = await prisma.category.count({ where });

    const categories = await prisma.category.findMany({
      where,
      take,
      skip,
      include: {
        _count: {
          select: {
            plans: true,
          },
        },
      },
      orderBy: {
        priority: "asc",
      },
    });

    res.json({ data: categories, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { image, title, priority } = req.body;
  try {
    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: { image, title, priority },
    });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  try {
    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: { active },
    });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Plan by ID
router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const category = await prisma.category.findUnique({
      include: {
        plans: true,
      },
    });

    if (category?.plans?.length > 0) {
      return res.status(500).json({ error: "You Cant Delete This Group.!" });
    }

    await prisma.category.delete({
      where: { id: Number(id) },
    });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
