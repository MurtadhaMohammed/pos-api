const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

// Create Plan
router.post("/", adminAuth, async (req, res) => {
  const { image, title, categoryId } = req.body;
  const permissions = req.user.permissions || [];

  try {

    if (!permissions.includes("superadmin") && !permissions.includes("create_plan")) {
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
router.get("/", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];

  console.log(permissions);

  try {

    if (!permissions.includes("superadmin") && !permissions.includes("read_plan")) {
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
  const permissions = req.user.permissions || [];

  try {

    if (!permissions.includes("superadmin") && !permissions.includes("update_plan")) {
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
  const permissions = req.user.permissions || [];

  try {

    if (!permissions.includes("superadmin") && !permissions.includes("plan_status")) {
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
  const permissions = req.user.permissions || [];

  try {

    if (!permissions.includes("superadmin") && !permissions.includes("delete_plan")) {
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
