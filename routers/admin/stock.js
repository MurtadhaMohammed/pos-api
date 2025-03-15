const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

router.get("/", adminAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const q = req.query.q;

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
      take,
      skip,
      orderBy: {
        createdAt: "desc",
      },
    });
    res.json({ data: stock, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
