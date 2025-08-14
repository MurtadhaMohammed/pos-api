const express = require("express");
const prisma = require("../../prismaClient");
const dayjs = require("dayjs");
const adminAuth = require("../../middleware/adminAuth");
const getDateDifferenceType = require("../../helper/getDateDifferenceType");
const { auditLog } = require("../../helper/audit");
// const agentAuth = require("../../middleware/agentAuth");
const router = express.Router();

// Read all Payments
router.get("/", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  // const userType = req.user.type;

  try {
    if (
      !permissions.includes("superadmin") &&
      !permissions.includes("read_payment")
    ) {
      return res.status(400).json({ error: "No permission to read payments" });
    }
    const q = req.query.q || undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const { type, providerId } = req?.user;
    const isProvider = type === "PROVIDER";

    const where = isProvider ? { providerId: parseInt(providerId) } : {};

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
        OR: [
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
        ],
      },
    });

    const payments = await prisma.payment.findMany({
      where: {
        ...where,
        OR: [
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
        ],
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            username: true,
            providerId: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
          },
        },
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

router.delete("/refund/:paymentId", adminAuth, async (req, res) => {
  const { paymentId } = req.params;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("refund_payment"))
    ) {
      return res.status(400).json({ error: "No permission to refund payment" });
    }

    const payment = await prisma.payment.findUnique({
      where: { id: Number(paymentId) },
      include: {
        seller: true,
      },
    });

    if (!payment || !payment.seller) {
      return res.status(404).json({
        success: false,
        msg: "Payment or associated seller not found",
      });
    }

    await prisma.$transaction([
      prisma.seller.update({
        where: {
          id: payment.sellerId,
        },
        data: {
          walletAmount: { increment: payment.companyPrice * payment.qty }, // Increment wallet amount
        },
      }),

      prisma.wallet.create({
        data: {
          sellerId: payment.seller.id,
          providerId: payment.seller.providerId,
          amount: payment.companyPrice * payment.qty,
          type: "REFUND",
        },
      }),
      // Delete payment record
      prisma.payment.delete({
        where: {
          id: Number(paymentId),
        },
      }),

      prisma.stock.updateMany({
        where: {
          code: payment.item?.code || "",
        },
        data: {
          status: "Ready",
        },
      }),
    ]);

    // Respond with success
    res.json({ success: true, msg: "Refund processed successfully" });
  } catch (error) {
    // Handle errors
    console.error("Error processing refund:", error.message);
    res.status(500).json({
      success: false,
      msg: "Internal server error",
      error: error.message,
    });
  } finally {
    await auditLog(req, res, "ADMIN", "REFUND_PAYMENT");
  }
});



router.get("/info/seller/:sellerId", adminAuth, async (req, res) => {
  const { sellerId } = req.params;
  const { startDate, endDate } = req.query;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  const parsedStartDate = startDate ? dayjs(startDate).startOf("day") : null;
  const parsedEndDate = endDate ? dayjs(endDate).endOf("day") : null;

  const whereCondition = {
    sellerId: parseInt(sellerId),
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

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("read_seller_info"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to read statistics" });
    }

    const payments = await prisma.payment.findMany({
      where: whereCondition,
    });

    let numberOfCards = payments
      .map((el) => el?.qty || 0)
      .reduce((a, b) => a + b, 0);

    let cards = payments.map((el) => {
      const item = Array.isArray(el?.item) ? el?.item[0] : el?.item || {};
      const details = item?.details || {};

      return {
        id: el?.localCard?.id,
        title: details?.title || "Unknown Title",
        qty: el?.qty || 0,
        totalDebts: (el?.companyPrice || 0) * (el?.qty || 0),
        sellerPayments: (el?.price || 0) * (el?.qty || 0),
        sellerProfit:
          ((el?.price || 0) - (el?.companyPrice || 0)) * (el?.qty || 0),
        createtAt: el?.createtAt,
      };
    });

    const groupedCards = Object.values(
      cards
        .sort((a, b) => b.createtAt - a.createtAt)
        .reduce((acc, card) => {
          if (!acc[card.id]) {
            acc[card.id] = {
              id: card?.id,
              title: card.title,
              qty: 0,
              totalDebts: 0,
              sellerPayments: 0,
              sellerProfit: 0,
            };
          }
          acc[card.id].qty += card.qty;
          acc[card.id].totalDebts += card.totalDebts;
          acc[card.id].sellerPayments += card.sellerPayments;
          acc[card.id].sellerProfit += card.sellerProfit;
          return acc;
        }, {})
    );

    res.json({ success: true, numberOfCards, cards: groupedCards });
  } catch (error) {
    console.error("Error fetching seller info:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

router.get("/info/provider/:providerId", adminAuth, async (req, res) => {
  const { providerId } = req.params;
  const { startDate, endDate } = req.query;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("read_provider_info"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to read statistics" });
    }
  } catch (error) {
    console.error("Error fetching provider info:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }

  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedEndDate = endDate ? new Date(endDate) : null;

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

  const groupedPayments = payments.reduce((acc, payment) => {
    const key = payment?.providerCardID;
    const paymentTitle = Array.isArray(payment?.item)
      ? payment?.item[0]?.details?.title
      : payment?.item?.details?.title;

    if (!acc[key]) acc[key] = [];
    acc[key].push(payment);
    return acc;
  }, {});

  Object.values(groupedPayments).forEach((group) => {
    const existingTitle = group.find((p) => p?.item?.details?.title)?.item
      ?.details?.title;

    group.forEach((payment) => {
      if (!payment?.item?.details?.title) {
        payment.item = payment.item || {};
        payment.item.details = payment.item.details || {};
        payment.item.details.title = existingTitle || "Unknown Title";
      }
    });
  });

  const updatedPayments = Object.values(groupedPayments).flat();

  const cards = updatedPayments.map((el) => {
    const paymentTitle = Array.isArray(el?.item)
      ? el?.item[0]?.details?.title
      : el?.item?.details?.title;

    return {
      title: paymentTitle || "Unknown Title",
      qty: el?.qty || 0,
      providerPayments: el?.localCard?.price * (el?.qty || 0),
      providerProfit:
        (el?.localCard?.price - el?.localCard?.companyPrice) * (el?.qty || 0),
    };
  });

  const groupedCards = Object.values(
    cards.reduce((acc, card) => {
      if (!acc[card.title]) {
        acc[card.title] = {
          title: card.title,
          qty: 0,
          providerPayments: 0,
          providerProfit: 0,
        };
      }
      acc[card.title].qty += card.qty;
      acc[card.title].providerPayments += card.providerPayments;
      acc[card.title].providerProfit += card.providerProfit;
      return acc;
    }, {})
  );

  const numberOfCards = groupedCards.reduce((sum, card) => sum + card.qty, 0);
  res.json({ success: true, numberOfCards, cards: groupedCards });
});

router.get("/intervals", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("statistics"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to read statistics" });
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

router.get("/cards", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== "ADMIN" ||
    (!permissions.includes("superadmin") && !permissions.includes("statistics"))
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

module.exports = router;
