const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

router.get("/", adminAuth, async (req, res) => {
  try {
    const permissions = req.user.permissions || [];
    const userType = req.user.type;

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_stock")
      )
    ) {
      return res.status(400).json({ error: "No permission to read stock" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const q = req.query.q;
    const skip = (page - 1) * limit;

    const where = {
      code: {
        contains: q || undefined,
      },
    };

    const total = await prisma.stock.count({ where });
    const stock = await prisma.stock.findMany({
      where,
      include: {
        provider: true,
        plan: true,
        archive: true,
      },
      skip: skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });
    res.json({ data: stock, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/info", adminAuth, async (req, res) => {
  try {
    let { providerId } = req.query;
    const permissions = req.user.permissions || [];
    const userType = req.user.type;

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("stock_info")
      )
    ) {
      return res.status(400).json({ error: "No permission to read stock info" });
    }

    if (
      req?.user?.providerId &&
      providerId &&
      parseInt(req?.user?.providerId) !== parseInt(providerId)
    ) {
      return res.status(401).json({ error: "لا تصير لوتي!." });
    }

    const stockSummary = await prisma.stock.groupBy({
      by: ["planId"],
      where: {
        // status: "Sold",
        providerId: parseInt(providerId, 10) || undefined,
      },
      _count: {
        id: true,
      },
      _min: {
        planId: true, // Just to include planId in results
      },
    });

    // Fetch plan titles separately and map them to the results
    const planIds = stockSummary.map((item) => item.planId);
    const plans = await prisma.plan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, title: true },
    });

    // Merge titles with grouped results
    const result = stockSummary.map((item) => ({
      planId: item.planId,
      title: plans.find((plan) => plan.id === item.planId)?.title || "Unknown",
      count: item._count.id,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching payments by interval:", error);
    res.status(500).json({ error: "An error occurred." });
  }
});

module.exports = router;
