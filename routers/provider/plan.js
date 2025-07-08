const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const router = express.Router();

router.get("/", providerAuth, async (req, res) => {
  const permissions = req.user.permissions;
  const userType = req.user.type;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_plan")
      )
    ){
      return res.status(403).json({ error: "No permission to read plans" });
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


module.exports = router;