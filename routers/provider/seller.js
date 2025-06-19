const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const providerAuth = require("../../middleware/providerAuth");
const dayjs = require("dayjs");
const { getSocketInstance, connectedUsers } = require("../../helper/socket");
const getDateDifferenceType = require("../../helper/getDateDifferenceType");
const router = express.Router();

router.post("/", providerAuth, async (req, res) => {
  const { name, username, password, address, phone, providerId } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;
 
  try {

    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("create_seller")
      ) 
    ){
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


    const seller = await prisma.seller.create({
      data: {
        name,
        username,
        password: hashedPassword,
        phone,
        address,
        providerId: providerId,
      },
    });
    res.status(201).json(seller);
  } catch (error) {
    console.error("Error creating seller:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { name, username, address, phone } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  try {

    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("update_seller")
      ) 
    ){
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

router.patch("/report/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("read_seller")
    )
  ){
    return res.status(400).json({ error: "No permission to read seller report" });
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
    };
  });

  res.json(refactorData);
});

router.put("/active/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("update_seller_status")
    )
  ){
    return res.status(400).json({ error: "No permission to update sellers" });
  }

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
});

router.put("/reset-password/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("reset_password_seller")
    )
  ){
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
      io.to(socketId).emit("logout", "Logout please!..."); 
    }

    res.json({
      message: "Password updated successfully",
      seller: updatedSeller,
    });
  } catch (error) {
    res.status(400).json({ error: "Error updating password" });
  }
});

router.get("/info", providerAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  if (
    userType !== 'PROVIDER' || 
    (
      !permissions.includes("superprovider") &&
      !permissions.includes("read_seller_info")
    )
  ){
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

router.get("/", providerAuth, async (req, res) => {
  const providerId = req.user.providerId;
  const permissions = req.user.permissions;
  const userType = req.user.userType;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_seller")
      )
    ){
      return res.status(403).json({ error: "No permission to read sellers" });
    }

    const sellers = await prisma.seller.findMany({
      where: {
        providerId: Number(providerId)
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
        createtAt: true
      }
    });

    res.json(sellers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", providerAuth, async (req, res) => {
  const { providerId, permissions } = req.user;
  const sellerId = Number(req.params.id);

  try {
    if (!permissions.includes("read_seller")) {
      return res.status(403).json({ error: "No permission to read sellers" });
    }

    const seller = await prisma.seller.findFirst({
      where: {
        id: sellerId,
        providerId: Number(providerId)
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
        createtAt: true
      }
    });

    if (!seller) {
      return res.status(404).json({ error: "Seller not found or you don't have access to it" });
    }

    res.json(seller);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;