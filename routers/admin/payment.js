const express = require("express");
const prisma = require("../../prismaClient");
const sellerAuth = require("../../middleware/sellerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Payment
router.post("/", sellerAuth, async (req, res) => {
  const {
    companyCardID,
    price,
    qty,
    providerId,
    sellerId,
    providerCardID,
    item,
  } = req.body;
  try {
    const payment = await prisma.payment.create({
      data: {
        companyCardID,
        price,
        qty,
        providerId,
        sellerId,
        providerCardID,
        item,
      },
    });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all Payments
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const payments = await prisma.payment.findMany();
    res.json({ data: payments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
