const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const router = express.Router();

router.get("/info", providerAuth, async (req, res) => {
    try {
      let { providerId } = req.query;
  
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