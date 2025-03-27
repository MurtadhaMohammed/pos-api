const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const providerAuth = require("../../middleware/providerAuth");
const dayjs = require("dayjs");
const router = express.Router();

// Register
router.post("/", providerAuth, async (req, res) => {
  const { name, username, password, address, phone, providerId, agentId } =
    req.body;

  try {
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
router.get("/", providerAuth, async (req, res) => {
  const take = parseInt(req.query.take || 8);
  const skip = parseInt(req.query.skip || 0);
  const { type, providerId } = req?.user;
  const isProvider = type === "PROVIDER";
  const searchQuery = req.query.q || "";

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
});

// Update seller
router.put("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { name, username, address, phone } = req.body;

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { name, username, address, phone },
  });

  res.json(seller);
});

// Update seller cative
router.put("/active/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { active },
  });

  res.json(seller);
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

    res.json({
      message: "Password updated successfully",
      seller: updatedSeller,
    });
  } catch (error) {
    res.status(400).json({ error: "Error updating password" });
  }
});

router.get("/info", providerAuth, async (req, res) => {
  try {
    const filterType = req?.query?.filterType;
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

    // Get payments grouped by sellerId
    const payments = await prisma.payment.groupBy({
      by: ["sellerId"],
      where: {
        sellerId: {
          in: sellerIds,
        },
        createtAt: { gte: start, lte: end },
      },
      _sum: {
        companyPrice: true,
        qty: true,
      },
    });

    const result = sellers
      .map((seller) => {
        const paymentData = payments.find((p) => p.sellerId === seller.id);

        return {
          id: seller.id,
          name: seller.name,
          address: seller?.address || null, // Ensuring address is included even if null
          totalPaid:
            (paymentData?._sum?.companyPrice || 0) *
            (paymentData?._sum?.qty || 0),
          count: paymentData?._sum?.qty || 0,
        };
      })
      .filter((seller) => seller.totalPaid > 0);

    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: "Error" });
  }
});

module.exports = router;
