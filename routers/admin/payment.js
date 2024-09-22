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
    // Get the page and limit from query parameters, with default values
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided

    // Calculate the number of items to skip based on the page and limit
    const skip = (page - 1) * limit;

    // Fetch the total count of records to calculate total pages
    const totalPayments = await prisma.payment.count();

    // Fetch the payments with pagination
    const payments = await prisma.payment.findMany({
      skip: skip, // Skip the previous records
      take: limit, // Limit the number of records fetched
      include: {
        seller: true,
        provider: true,
      },
      orderBy: {
        createtAt: "desc",
      },
    });

    // Calculate total number of pages
    const totalPages = Math.ceil(totalPayments / limit);

    // Return paginated results
    res.json({
      data: payments,
      totalItems: totalPayments,
      totalPages: totalPages,
      currentPage: page,
      pageSize: limit,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
