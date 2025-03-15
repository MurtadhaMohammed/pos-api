const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

// Get all Categories
router.get("/", providerAuth, async (req, res) => {
  const take = parseInt(req.query.take || 8);
  const skip = parseInt(req.query.skip || 0);
  const searchQuery = req.query.q || "";

  const where = {
    active: true,
    title: {
      contains: searchQuery,
      mode: "insensitive",
    },
  };

  const total = await prisma.category.count({ where });
  const categories = await prisma.category.findMany({
    where,
    take,
    skip,
  });

  res.json({ records: categories, total });
});

module.exports = router;
