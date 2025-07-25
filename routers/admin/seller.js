const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const providerAuth = require("../../middleware/providerAuth");
const dayjs = require("dayjs");
const { getSocketInstance, connectedUsers } = require("../../helper/socket");
const getDateDifferenceType = require("../../helper/getDateDifferenceType");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

// Register
router.post("/", adminAuth, async (req, res) => {
  const { name, username, password, address, phone, providerId, agentId } =
    req.body;

  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("create_seller")
      )
    ) {
      return res.status(400).json({ error: "No permission to create sellers" });
    }  

    const existingSeller = await prisma.seller.findUnique({
      where: {
        username: username,
      },
    });

    if (existingSeller) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let agentData = null;

    if (agentId) {
      const agent = await prisma.agent.findUnique({
        where: {
          id: agentId,
        },
      });

      agentData = agent;
    }

    const seller = await prisma.seller.create({
      data: {
        name,
        username,
        password: hashedPassword,
        phone,
        address,
        providerId: agentId ? agentData?.providerId : providerId,
        agentId,
      },
    });
    res.status(201).json(seller);
  } catch (error) {
    console.error("Error creating seller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all sellers
router.get("/", adminAuth, async (req, res) => {
  const take = parseInt(req.query.take || 8);
  const skip = parseInt(req.query.skip || 0);
  const { type, providerId } = req?.user;
  const isProvider = type === "PROVIDER";
  const searchQuery = req.query.q || "";
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    
      if (
        userType !== 'ADMIN' || 
        (
          !permissions.includes("superadmin") &&
          !permissions.includes("read_seller")
        )
      ) {
        return res.status(400).json({ error: "No permission to read sellers" });
      }

    const where = {
      AND: [
        isProvider && !req.query.providerId
          ? { providerId: parseInt(providerId) }
          : {},
        {
          providerId: parseInt(req?.query?.providerId || 0) || undefined,
        },
        {
          OR: [
            {
              name: {
                contains: searchQuery,
                mode: "insensitive",
              },
            },
            {
              phone: {
                contains: searchQuery,
                mode: "insensitive",
              },
            },
            {
              username: {
                contains: searchQuery,
                mode: "insensitive",
              },
            },
          ],
        },
      ],
    };

    const total = await prisma.seller.count({ where });
    const sellers = await prisma.seller.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        active: true,
        createtAt: true,
        address: true,
        walletAmount: true,
        provider: {
          select: {
            id: true,
            name: true,
          }
        },
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });

    res.json({ data: sellers, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update seller
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, username, address, phone } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("update_seller")
      )
    ) {
      return res.status(400).json({ error: "No permission to update sellers" });
    }

    const seller = await prisma.seller.update({
      where: { id: parseInt(id) },
      data: { name, username, address, phone },
    });

    res.json(seller);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// get seller report
router.patch("/report/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'ADMIN' || 
    (
      !permissions.includes("superadmin") &&
      !permissions.includes("read_seller_report")
    )
  ) {
    return res.status(400).json({ error: "No permission to read seller info report" });
  }

  const seller = await prisma.seller.findUnique({
    where: {
      id: parseInt(id),
    },
  });

  if (
    seller &&
    req?.user?.providerId &&
    parseInt(req?.user?.providerId) !== seller.providerId
  ) {
    return res.status(401).json({ error: "لا تصير لوتي!." });
  }

  const payment = await prisma.payment.findMany({
    where: { sellerId: parseInt(id) },
    orderBy: {
      createtAt: "desc",
    },
  });

  const refactorData = payment.map((el) => {
    let item = Array.isArray(el?.item) ? el?.item[0] : el?.item;
    let code = Array.isArray(el?.item)
      ? el?.item.map((d) => d.code).join(" ,")
      : el?.item?.code;

    return {
      id: el?.id,
      code,
      createdAt: el?.createtAt,
      plan: item?.details?.title,
      price: el?.price,
      cost: el?.companyPrice,
      qty: el?.qty
    };
  });

  res.json(refactorData);
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'ADMIN' || 
    (
      !permissions.includes("superadmin") &&
      !permissions.includes("update_seller_status")
    )
  ) {
    return res.status(400).json({ error: "No permission to update sellers" });
  }

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { active },
  });

  const socketId = connectedUsers[seller?.id];
  if (!seller?.active && socketId) {
    const io = getSocketInstance();
    io.to(socketId).emit("logout", "Logout please!..."); // Send notification to all clients
  }

  res.json(seller);
});

router.put("/reset-password/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'ADMIN' || 
    (
      !permissions.includes("superadmin") &&
      !permissions.includes("reset_password_seller")
    )
  ) {
    return res.status(400).json({ error: "No permission to update sellers" });
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedSeller = await prisma.seller.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword },
    });

    const socketId = connectedUsers[updatedSeller?.id];
    if (socketId) {
      const io = getSocketInstance();
      io.to(socketId).emit("logout", "Logout please!..."); // Send notification to all clients
    }

    res.json({
      message: "Password updated successfully",
      seller: updatedSeller,
    });
  } catch (error) {
    res.status(400).json({ error: "Error updating password" });
  }
});

router.get("/info", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== 'ADMIN' || 
    (
      !permissions.includes("superadmin") &&
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

    // Get all sellers for the provider
    const sellers = await prisma.seller.findMany({
      where: {
        providerId: req?.user?.providerId,
      },
      select: {
        id: true,
        name: true, // Assuming sellers have a "name" field
        address: true,
      },
    });

    const sellerIds = sellers.map((el) => el?.id);

    // Get all payments for the given sellers within the date range
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

    // Group payments by sellerId
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

module.exports = router;
