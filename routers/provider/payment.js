const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const router = express.Router();
const dayjs = require("dayjs");


router.get("/", providerAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  const providerId = req.user.providerId;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_payment")
      )
    ){
      return res.status(400).json({ error: "No permission to read payments" });
    }
    
    const q = req.query.q || undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const where = {
      providerId: parseInt(providerId)
    };

    if (startDate && endDate) {
      where.createtAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const skip = (page - 1) * limit;

    const totalPayments = await prisma.payment.count({
      where: {
        ...where,
        OR: q ? [
          {
            seller: {
              name: {
                contains: q,
              },
            },
          },
          {
            item: {
              array_contains: [{ code: q }],
            },
          },
        ] : undefined
      },
    });

    const payments = await prisma.payment.findMany({
      where: {
        ...where,
        OR: q ? [
          {
            seller: {
              name: {
                contains: q,
              },
            },
          },
          {
            item: {
              array_contains: [{ code: q }],
            },
          },
        ] : undefined
      },
      include: {
        seller: true,
        provider: true,
      },
      skip: skip,
      take: limit,
      orderBy: {
        createtAt: "desc",
      },
    });

    const totalPages = Math.ceil(totalPayments / limit);

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

router.get("/info", providerAuth , async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("statistics")
    )
  ) {
    return res.status(400).json({ error: "No permission to get seller info" });
  }


  try {
    let { filterType, startDate, endDate } = req.query;
    const now = dayjs();
    let start, end;

    if (startDate && endDate) {
      start = dayjs(startDate).startOf("day").toDate();
      end = dayjs(endDate).endOf("day").toDate();
      filterType = getDateDifferenceType(startDate, endDate);
    } else
      switch (filterType) {
        case "day":
          start = now.startOf("day").toDate();
          end = now.endOf("day").toDate();
          break;
        case "yesterday":
          start = now.subtract(1, "day").startOf("day").toDate();
          end = now.subtract(1, "day").endOf("day").toDate();
          break;
        case "week":
          start = now.startOf("week").toDate();
          end = now.endOf("week").toDate();
          break;
        case "month":
          start = now.startOf("month").toDate();
          end = now.endOf("month").toDate();
          break;
        case "year":
          start = now.startOf("year").toDate();
          end = now.endOf("year").toDate();
          break;
      }

    const sellers = await prisma.seller.findMany({
      where: {
        providerId: req?.user?.providerId,
      },
      select: {
        id: true,
        name: true, 
        address: true,
      },
    });

    const sellerIds = sellers.map((el) => el?.id);

    const payments = await prisma.payment.findMany({
      where: {
        sellerId: { in: sellerIds },
        createtAt: { gte: start, lte: end },
      },
      select: {
        sellerId: true,
        companyPrice: true,
        qty: true,
      },
    });

    
    const paymentMap = payments.reduce((acc, payment) => {
      if (!acc[payment.sellerId]) {
        acc[payment.sellerId] = { totalPaid: 0, count: 0 };
      }
      acc[payment.sellerId].totalPaid += payment.companyPrice * payment.qty;
      acc[payment.sellerId].count += payment.qty;
      return acc;
    }, {});

    const result = sellers
      .map((seller) => ({
        id: seller.id,
        name: seller.name,
        address: seller?.address || null,
        totalPaid: paymentMap[seller.id]?.totalPaid || 0,
        count: paymentMap[seller.id]?.count || 0,
      }))
      .filter((seller) => seller.totalPaid > 0);

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: "Error" });
  }
});

router.get("/intervals", providerAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("statistics")
      )
    ) {
      return res.status(400).json({ error: "No permission to read statistics" });
    }

    let { filterType, providerId, startDate, endDate } = req.query;

    if (
      req?.user?.providerId &&
      providerId &&
      parseInt(req?.user?.providerId) !== parseInt(providerId)
    ) {
      return res.status(401).json({ error: "لا تصير لوتي!." });
    }

    // Validate filterType
    if (!["day", "week", "month", "year", "yesterday"].includes(filterType)) {
      return res.status(400).json({
        error: "Invalid filterType. Use day, yesterday, week, month, or year.",
      });
    }

    // Calculate start and end dates dynamically
    const now = dayjs();
    let start, end;

    if (startDate && endDate) {
      start = dayjs(startDate).startOf("day").toDate();
      end = dayjs(endDate).endOf("day").toDate();
      filterType = getDateDifferenceType(startDate, endDate);
    } else
      switch (filterType) {
        case "day":
          start = now.startOf("day").toDate();
          end = now.endOf("day").toDate();
          break;
        case "yesterday":
          start = now.subtract(1, "day").startOf("day").toDate();
          end = now.subtract(1, "day").endOf("day").toDate();
          break;
        case "week":
          start = now.startOf("week").toDate();
          end = now.endOf("week").toDate();
          break;
        case "month":
          start = now.startOf("month").toDate();
          end = now.endOf("month").toDate();
          break;
        case "year":
          start = now.startOf("year").toDate();
          end = now.endOf("year").toDate();
          break;
      }

    // Fetch payments within the selected date range
    const payments = await prisma.payment.findMany({
      where: {
        createtAt: { gte: start, lte: end },
        providerId: parseInt(providerId, 10) || undefined,
      },
      select: { createtAt: true, price: true, companyPrice: true, qty: true },
    });

    let intervals = [];

    if (["day", "yesterday"].includes(filterType)) {
      // Group by hour
      intervals = Array.from({ length: 24 }, (_, i) => ({
        interval: `${i}:00`,
        total: 0,
      }));
    } else if (filterType === "week") {
      // Group by day of the week
      intervals = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ].map((day) => ({ interval: day, total: 0 }));
    } else if (filterType === "month") {
      // Group by day of the month
      const daysInMonth = now.daysInMonth();
      intervals = Array.from({ length: daysInMonth }, (_, i) => ({
        interval: `${i + 1}`,
        total: 0,
      }));
    } else if (filterType === "year") {
      // Group by month
      intervals = Array.from({ length: 12 }, (_, i) => ({
        interval: dayjs().month(i).format("MMM"),
        total: 0,
      }));
    }

    // Process payments and map them to the correct interval
    intervals = intervals.map((interval, index) => {
      let filteredPayments = payments.filter((p) => {
        const paymentDate = dayjs(p.createtAt);
        if (["day", "yesterday"].includes(filterType)) {
          return paymentDate.hour() === index;
        } else if (filterType === "week") {
          return paymentDate.format("dddd") === interval.interval;
        } else if (filterType === "month") {
          return paymentDate.date() === parseInt(interval.interval, 10);
        } else if (filterType === "year") {
          return paymentDate.month() === index;
        }
        return false;
      });

      const total = filteredPayments.reduce(
        (sum, curr) => sum + (curr.companyPrice || 0) * (curr.qty || 1), // ✅ Correct Calculation: price * qty
        0
      );

      return { ...interval, total };
    });

    res.json({
      paymentsByInterval: intervals,
    });
  } catch (error) {
    console.error("Error fetching payments by interval:", error);
    res.status(500).json({ error: "An error occurred." });
  }
});

router.get("/cards", providerAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("statistics")
    )
  ) {
    return res.status(400).json({ error: "No permission to read statistics" });
  }

  try {
    let { filterType, providerId, startDate, endDate } = req.query;

    if (
      req?.user?.providerId &&
      providerId &&
      parseInt(req?.user?.providerId) !== parseInt(providerId)
    ) {
      return res.status(401).json({ error: "لا تصير لوتي!." });
    }

    // Validate filterType
    if (!["day", "week", "month", "year", "yesterday"].includes(filterType)) {
      return res.status(400).json({
        error: "Invalid filterType. Use day, yesterday, week, month, or year.",
      });
    }

    const now = dayjs();
    let start, end;

    if (startDate && endDate) {
      start = dayjs(startDate).startOf("day").toDate();
      end = dayjs(endDate).endOf("day").toDate();
      filterType = getDateDifferenceType(startDate, endDate);
    } else
      switch (filterType) {
        case "day":
          start = now.startOf("day").toDate();
          end = now.endOf("day").toDate();
          break;
        case "yesterday":
          start = now.subtract(1, "day").startOf("day").toDate();
          end = now.subtract(1, "day").endOf("day").toDate();
          break;
        case "week":
          start = now.startOf("week").toDate();
          end = now.endOf("week").toDate();
          break;
        case "month":
          start = now.startOf("month").toDate();
          end = now.endOf("month").toDate();
          break;
        case "year":
          start = now.startOf("year").toDate();
          end = now.endOf("year").toDate();
          break;
      }

    const stockSummary = await prisma.stock.groupBy({
      by: ["planId"],
      where: {
        sold_at: { gte: start, lte: end },
        status: "Sold",
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

router.get("/info/provider/:providerId", providerAuth, async (req, res) => {
  const { providerId } = req.params;
  const { startDate, endDate, filterType } = req.query;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("statistics")
      )
    ) {
      return res.status(400).json({ error: "No permission to read statistics" });
    }
  } catch (error) {
    console.error("Error fetching provider info:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }

  // Calculate date range based on filterType using dayjs
  let parsedStartDate = null;
  let parsedEndDate = null;

  if (filterType) {
    const dayjs = require('dayjs');
    const now = dayjs();
    
    switch (filterType.toLowerCase()) {
      case 'day':
        parsedStartDate = now.startOf('day').toDate();
        parsedEndDate = now.endOf('day').toDate();
        break;
      case 'yesterday':
        parsedStartDate = now.subtract(1, 'day').startOf('day').toDate();
        parsedEndDate = now.subtract(1, 'day').endOf('day').toDate();
        break;
      case 'week':
        parsedStartDate = now.startOf('week').toDate();
        parsedEndDate = now.endOf('week').toDate();
        break;
      case 'month':
        parsedStartDate = now.startOf('month').toDate();
        parsedEndDate = now.endOf('month').toDate();
        break;
      case 'year':
        parsedStartDate = now.startOf('year').toDate();
        parsedEndDate = now.endOf('year').toDate();
        break;
      default:
        if (startDate) parsedStartDate = dayjs(startDate).toDate();
        if (endDate) parsedEndDate = dayjs(endDate).toDate();
    }
  } else {
    const dayjs = require('dayjs');
    if (startDate) parsedStartDate = dayjs(startDate).toDate();
    if (endDate) parsedEndDate = dayjs(endDate).toDate();
  }

  const whereCondition = {
    providerId: parseInt(providerId),
  };

  if (parsedStartDate && parsedEndDate) {
    whereCondition.createtAt = {
      gte: parsedStartDate,
      lte: parsedEndDate,
    };
  } else if (parsedStartDate) {
    whereCondition.createtAt = {
      gte: parsedStartDate,
    };
  } else if (parsedEndDate) {
    whereCondition.createtAt = {
      lte: parsedEndDate,
    };
  }

  const payments = await prisma.payment.findMany({
    where: whereCondition,
  });

  const totalAmountPaid = payments.reduce((sum, payment) => {
    const price = payment?.localCard?.price || 0;
    const qty = payment?.qty || 0;
    return sum + (price * qty);
  }, 0);

  const totalCardsSold = payments.reduce((sum, payment) => {
    return sum + (payment?.qty || 0);
  }, 0);

  const numberOfSellers = await prisma.seller.count({
    where: {
      providerId: parseInt(providerId),
    },
  });

  res.json({ 
    success: true, 
    totalAmountPaid: Number(totalAmountPaid) || 0,
    totalCardsSold: Number(totalCardsSold) || 0,
    numberOfSellers,
  });
});


module.exports = router;