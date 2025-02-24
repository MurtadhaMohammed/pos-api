const express = require("express");
const prisma = require("../../prismaClient");
const sellerAuth = require("../../middleware/sellerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const dayjs = require("dayjs");
const adminAuth = require("../../middleware/adminAuth");
// const agentAuth = require("../../middleware/agentAuth");
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

// Create Payment
// router.post("/create", sellerAuth, async (req, res) => {
//   const { providerId, sellerId, code, companyCardID, cardId } = req.body;
//   try {
//     const card = await prisma.card.findUnique({
//       where: {
//         id: parseInt(cardId),
//       },
//       include: {
//         cardType: true,
//       },
//     });

//     const data = {
//       id: companyCardID,
//       code,
//       status: "sold",
//       details: {
//         cover: card.cardType.image,
//         price: card.companyPrice,
//         title: card.cardType.name,
//       },
//       createdAt: "2024-10-03T11:35:24.158Z",
//       updatedAt: "2024-10-03T19:02:13.170Z",
//     };

//     const payment = await prisma.payment.create({
//       data: {
//         provider: {
//           connect: { id: parseInt(providerId) },
//         },
//         seller: {
//           connect: { id: parseInt(sellerId) },
//         },
//         companyCardID: parseInt(companyCardID),
//         price: card?.price,
//         companyPrice: card?.companyPrice,
//         qty: 1,
//         providerCardID: parseInt(cardId),
//         item: data,
//       },
//     });

//     await prisma.seller.update({
//       where: {
//         id: parseInt(sellerId),
//       },
//       data: {
//         walletAmount: {
//           decrement: card?.companyPrice,
//         },
//         paymentAmount: {
//           increment: card?.companyPrice,
//         },
//       },
//     });
//     req.status(200).json(payment);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Read all Payments
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const q = req.query.q || undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const { type, providerId, agentId } = req?.user;
    const isProvider = type === "PROVIDER";
    const isAgent = type === "AGENT";

    const where = isProvider
      ? { providerId: parseInt(providerId) }
      : isAgent
      ? { agentId: parseInt(agentId) }
      : {};

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
        seller: true,
        provider: true,
        agent: true,
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

// Get payment cards
router.get("/pos/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const dateFilter =
      startDate && endDate
        ? {
            createtAt: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }
        : {};

    const payments = await prisma.payment.findMany({
      where: {
        sellerId: parseInt(id),
        ...dateFilter,
      },
      select: {
        item: true,
        price: true,
        companyPrice: true,
      },
    });

    let data = {
      total: payments?.length,
      price: payments?.map((el) => el.price)?.reduce((a, b) => a + b, 0),
      companyPrice: payments
        ?.map((el) => el.companyPrice)
        ?.reduce((a, b) => a + b, 0),
      details: Object.entries(
        payments.reduce((acc, current) => {
          const title = current.item.details.title;
          if (!acc[title]) {
            acc[title] = 0;
          }
          acc[title] += 1;
          return acc;
        }, {})
      ).map(([title, count]) => ({ title, count })),
    };

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/refund/:paymentId", dashboardAuth, async (req, res) => {
  const { paymentId } = req.params;

  try {
    // Fetch payment and related seller in a single query
    const payment = await prisma.payment.findUnique({
      where: { id: Number(paymentId) },
      include: {
        seller: true,
      },
    });

    // Validate payment and seller existence
    if (!payment || !payment.seller) {
      return res.status(404).json({
        success: false,
        msg: "Payment or associated seller not found",
      });
    }

    // Perform refund transaction
    await prisma.$transaction([
      // Update seller's wallet amount
      prisma.seller.update({
        where: {
          id: payment.sellerId,
        },
        data: {
          walletAmount: { increment: payment.companyPrice * payment.qty }, // Increment wallet amount
        },
      }),

       prisma.wallet.create({
        data:{
          sellerId:payment.seller.id,
          providerId:payment.seller.providerId,
          amount: payment.companyPrice * payment.qty,
          type:"REFUND",
        }
      }),
      // Delete payment record
      prisma.payment.delete({
        where: {
          id: Number(paymentId),
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
  }
});

router.get("/seller", async (req, res) => {
  const { sellerId, startDate, endDate } = req.query;

  if (!sellerId) {
    return res.status(400).json({ error: "sellerId is required." });
  }

  try {
    const dateFilter = {};

    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }

    if (endDate) {
      dateFilter.lte = new Date(endDate);
    }

    const payments = await prisma.payment.findMany({
      where: {
        sellerId: parseInt(sellerId),
        createtAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
      },
      include: {
        seller: true,
        provider: true,
        agent: true,
      },
    });

    let totalPayment = 0;
    let totalCompanyPayment = 0;
    let totalNetProfit = 0;

    payments.forEach((payment) => {
      totalPayment += payment.price * (payment.qty || 1);
      totalCompanyPayment += payment.companyPrice * (payment.qty || 1);
    });

    totalNetProfit = totalPayment - totalCompanyPayment;

    return res.status(200).json({
      sellerId: sellerId,
      startDate: startDate || "Not specified",
      endDate: endDate || "Not specified",
      totalPayment,
      cashback: totalNetProfit,
      payments,
    });
  } catch (error) {
    console.error("Error calculating payments:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while calculating payments." });
  }
});

// router.get("/info/:agentId", async (req, res) => {
//   const { agentId } = req.params;

//   const payments = await prisma.payment.findMany({
//     where: {
//       agentId: parseInt(agentId),
//     },
//   });

//   let numberOfCards = payments.map((el) => el?.qty).reduce((a, b) => a + b, 0);
//   let cards = payments.map((el) => ({
//     title: el?.item[0]?.details?.title,
//     qty: el?.qty,
//     sellerPayments: el?.price * el?.qty,
//     agentPayments: el?.companyPrice * el?.qty,
//     // providerPayments: el?.localCard?.companyPrice * el?.qty,
//     sellerProfit: el?.price * el?.qty - el?.companyPrice * el?.qty,
//     agentProfit:
//       el?.companyPrice * el?.qty - el?.localCard?.companyPrice * el?.qty,
//   }));

//   const groupedCards = Object.values(
//     cards.reduce((acc, card) => {
//       if (!acc[card.title]) {
//         acc[card.title] = {
//           title: card.title,
//           qty: 0,
//           sellerPayments: 0,
//           agentPayments: 0,
//           // providerPayments: 0,
//           sellerProfit: 0,
//           agentProfit: 0,
//         };
//       }
//       acc[card.title].qty += card.qty;
//       acc[card.title].sellerPayments += card.sellerPayments;
//       acc[card.title].agentPayments += card.agentPayments;
//       acc[card.title].sellerProfit += card.sellerProfit;
//       acc[card.title].agentProfit += card.agentProfit;
//       // acc[card.title].providerPayments += card.providerPayments;
//       return acc;
//     }, {})
//   );

//   res.json({ success: true, numberOfCards, cards: groupedCards });
// });

router.get("/info/agent/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const { startDate, endDate } = req.query;

  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedEndDate = endDate ? new Date(endDate) : null;

  const whereCondition = {
    agentId: parseInt(agentId),
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

  let numberOfCards = payments
    .map((el) => el?.qty || 0)
    .reduce((a, b) => a + b, 0);
  let cards = payments.map((el) => {
    const item = Array.isArray(el?.item) ? el?.item[0] : el?.item || {};
    const details = item?.details || {};

    return {
      title: details?.title || "Unknown Title",
      qty: el?.qty || 0,
      agentPayments: (el?.localCard?.sellerPrice || 0) * (el?.qty || 0),
      agentProfit:
        (el?.localCard?.sellerPrice || 0) * (el?.qty || 0) -
        (el?.localCard?.companyPrice || 0) * (el?.qty || 0),
    };
  });

  const groupedCards = Object.values(
    cards.reduce((acc, card) => {
      if (!acc[card.title]) {
        acc[card.title] = {
          title: card.title,
          qty: 0,
          agentPayments: 0,
          agentProfit: 0,
        };
      }
      acc[card.title].qty += card.qty;
      acc[card.title].agentPayments += card.agentPayments;
      acc[card.title].agentProfit += card.agentProfit;
      return acc;
    }, {})
  );

  res.json({ success: true, numberOfCards, cards: groupedCards });
});

router.get("/info/seller/:sellerId", async (req, res) => {
  const { sellerId } = req.params;
  const { startDate, endDate } = req.query;

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

router.get("/info/provider/:providerId", async (req, res) => {
  const { providerId } = req.params;
  const { startDate, endDate } = req.query;

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
  try {
    const { filterType } = req.query;

    // Validate filterType
    if (!["day", "week", "month", "year", "yesterday"].includes(filterType)) {
      return res.status(400).json({
        error: "Invalid filterType. Use day, yesterday, week, month, or year.",
      });
    }

    // Calculate start and end dates dynamically
    const now = dayjs();
    let start, end;

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
      where: { createtAt: { gte: start, lte: end } },
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
      intervals = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
        (day) => ({ interval: day, total: 0 })
      );
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
        (sum, curr) => sum + ((curr.companyPrice || 0) * (curr.qty || 1)), // ✅ Correct Calculation: price * qty
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

module.exports = router;
