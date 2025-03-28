const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

router.get("/", adminAuth, async (req, res) => {
  try {
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

module.exports = router;
