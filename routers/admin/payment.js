const express = require("express");
const prisma = require("../../prismaClient");
const sellerAuth = require("../../middleware/sellerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
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
    // Get the page and limit from query parameters, with default values
    const q = req.query.q || undefined; // Default to page 1 if not provided
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
    const { type, providerId, agentId } = req?.user;
    const isProvider = type === "PROVIDER";
    const isAgent = type === "AGENT";

    const where = isProvider
      ? {
          providerId: parseInt(providerId),
        }
      : isAgent
      ? {
          agentId: parseInt(agentId),
        }
      : {};
    // Calculate the number of items to skip based on the page and limit
    const skip = (page - 1) * limit;

    let condetions = { ...where };

    if (q && q.trim() !== "")
      condetions = {
        OR: [
          {
            item: {
              path: ["code"],
              string_contains: q,
            },
          },
          {
            seller: {
              OR: [
                {
                  phone: {
                    contains: q || undefined,
                  },
                },
                {
                  name: {
                    contains: q || undefined,
                  },
                },
              ],
            },
          },
        ],
        ...where,
      };
    // Fetch the total count of records to calculate total pages
    const totalPayments = await prisma.payment.count({
      where: condetions,
    });

    // Fetch the payments with pagination
    const payments = await prisma.payment.findMany({
      where: condetions,
      include: {
        seller: true,
        provider: true,
        agent: true,
      },
      skip: skip, // Skip the previous records
      take: limit, // Limit the number of records fetched
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

    totalNetProfit =  totalPayment - totalCompanyPayment;




    return res.status(200).json({
      sellerId: sellerId,
      startDate: startDate || "Not specified",
      endDate: endDate || "Not specified",
      totalPayment,
      cashback:totalNetProfit,
      payments
    });
  } catch (error) {
    console.error("Error calculating payments:", error);
    return res.status(500).json({ error: "An error occurred while calculating payments." });
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

  let numberOfCards = payments.map((el) => el?.qty).reduce((a, b) => a + b, 0);
  let cards = payments.map((el) => ({
    title: el?.item[0]?.details?.title,
    qty: el?.qty,
    agentPayments: el?.localCard?.companyPrice * el?.qty,
    agentProfit:
      el?.localCard?.sellerPrice * el?.qty - el?.localCard?.companyPrice * el?.qty,
  }));

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

  const parsedStartDate = startDate ? new Date(startDate) : null;
  const parsedEndDate = endDate ? new Date(endDate) : null;

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

  const payments = await prisma.payment.findMany({
    where: whereCondition,
  });

  let numberOfCards = payments.map((el) => el?.qty).reduce((a, b) => a + b, 0);
  let cards = payments.map((el) => ({
    title: el?.item[0]?.details?.title,
    qty: el?.qty,
    sellerPayments: el?.price * el?.qty,
    sellerProfit: el?.price * el?.qty - el?.companyPrice * el?.qty,
  }));

  const groupedCards = Object.values(
    cards.reduce((acc, card) => {
      if (!acc[card.title]) {
        acc[card.title] = {
          title: card.title,
          qty: 0,
          sellerPayments: 0,
          sellerProfit: 0,
        };
      }
      acc[card.title].qty += card.qty;
      acc[card.title].sellerPayments += card.sellerPayments;
      acc[card.title].sellerProfit += card.sellerProfit;
      return acc;
    }, {})
  );

  res.json({ success: true, numberOfCards, cards: groupedCards });
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
    
    console.log("payment new", paymentTitle);

    if (!acc[key]) acc[key] = [];
    acc[key].push(payment);
    return acc;
  }, {});

  Object.values(groupedPayments).forEach((group) => {
    const existingTitle = group.find((p) => p?.item?.details?.title)?.item?.details?.title;

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
      providerProfit: (el?.localCard?.price - el?.localCard?.companyPrice) * (el?.qty || 0),
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

module.exports = router;
