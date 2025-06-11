const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

// Create Plan
router.post("/", adminAuth, async (req, res) => {
  const { image, title, categoryId } = req.body;
  const userType = req.user.type;
  const permisson = req.user.permissons || {};

  try {

    if (userType == 'ADMIN' && !permisson.create_plan) {
      return res.status(400).json({ error: "No permission to create plan" });
    }

    const plan = await prisma.plan.create({
      data: { image, title, categoryId },
    });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all plans
router.get("/", providerAuth, async (req, res) => {
  const userType = req.user.type;
  const permisson = req.user.permissons || {};

  try {

    if (userType == 'ADMIN' && !permisson.read_plan) {
      return res.status(400).json({ error: "No permission to read plan" });
    }

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
      include: {
        category: true,
      },
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
  const { image, title, categoryId } = req.body;
  const userType = req.user.type;
  const permisson = req.user.permissons || {};

  try {

    if (userType == 'ADMIN' && !permisson.update_plan) {
      return res.status(400).json({ error: "No permission to update plan" });
    }
    const plan = await prisma.plan.update({
      where: { id: Number(id) },
      data: { image, title, categoryId },
    });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  const userType = req.user.type;
  const permisson = req.user.permissons || {};

  try {

    if (userType == 'ADMIN' && !permisson.plan_status) {
      return res.status(400).json({ error: "No permission to update plan" });
    }

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
  const userType = req.user.type;
  const permisson = req.user.permissons || {};

  try {

    if (userType == 'ADMIN' && !permisson.delete_plan) {
      return res.status(400).json({ error: "No permission to delete plan" });
    }
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
