const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const providerAuth = require("./middleware/providerAuth");
const { auditLog } = require("../../helper/audit");
const dayjs = require("dayjs");
const { getSocketInstance, connectedUsers } = require("../../helper/socket");
const getDateDifferenceType = require("../../helper/getDateDifferenceType");
const router = express.Router();

router.post("/", providerAuth, async (req, res) => {
  const { name, username, password, address, phone } = req.body;

  try {
    const existingSeller = await prisma.seller.findUnique({
      where: {
        username: username,
      },
    });

    if (existingSeller) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const provider = await prisma.provider.findUnique({
      where: {
        id: parseInt(req?.user?.providerId),
      },
    });

    if (!provider) {
      return res.status(400).json({ error: "Provider not found" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const seller = await prisma.seller.create({
      data: {
        name,
        username,
        password: hashedPassword,
        phone,
        address,
        providerId: parseInt(provider?.id),
      },
    });

    res.status(201).json(seller);
  } catch (error) {
    console.error("Error creating seller:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await auditLog(req, res, "PROVIDER", "CREATE_SELLER");
  }
});

router.put("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { name, username, address } = req.body;

  try {
    const seller = await prisma.seller.update({
      where: { id: parseInt(id) },
      data: { name, username, address },
    });

    res.json(seller);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await auditLog(req, res, "PROVIDER", "UPDATE_SELLER");
  }
});

router.patch("/report/:id", providerAuth, async (req, res) => {
  const { id } = req.params;

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
    };
  });

  res.json(refactorData);
});

router.put("/active/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { active },
  });

  const socketId = connectedUsers[seller?.id];
  if (!seller?.active && socketId) {
    const io = getSocketInstance();
    io.to(socketId).emit("logout", "Logout please!...");
  }

  res.json(seller);
  await auditLog(req, res, "PROVIDER", "UPDATE_SELLER_STATUS");
});

router.put("/reset-password/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedSeller = await prisma.seller.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword },
    });

    const socketId = connectedUsers[updatedSeller?.id];
    if (socketId) {
      const io = getSocketInstance();
      io.to(socketId).emit("logout", "Logout please!...");
    }

    res.json({
      message: "Password updated successfully",
      seller: updatedSeller,
    });
  } catch (error) {
    res.status(400).json({ error: "Error updating password" });
  } finally {
    await auditLog(req, res, "PROVIDER", "RESET_SELLER_PASSWORD");
  }
});

router.get("/info", providerAuth, async (req, res) => {
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

router.get("/", providerAuth, async (req, res) => {
  const take = parseInt(req.query.take || 8);
  const skip = parseInt(req.query.skip || 0);
  const { type, providerId } = req?.user;
  const isProvider = type === "PROVIDER";
  const searchQuery = req.query.q || "";

  try {
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
      include: {
        provider: true,
        wallet: true,
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

router.get("/:id", providerAuth, async (req, res) => {
  const { providerId } = req.user;
  const sellerId = Number(req.params.id);

  try {
    const seller = await prisma.seller.findFirst({
      where: {
        id: sellerId,
        providerId: Number(providerId),
      },
      select: {
        id: true,
        name: true,
        username: true,
        address: true,
        phone: true,
        walletAmount: true,
        paymentAmount: true,
        isHajji: true,
        active: true,
        createtAt: true,
      },
    });

    if (!seller) {
      return res
        .status(404)
        .json({ error: "Seller not found or you don't have access to it" });
    }

    res.json(seller);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
