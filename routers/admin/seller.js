const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Register
router.post("/", dashboardAuth, async (req, res) => {
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
router.get("/", dashboardAuth, async (req, res) => {
  const take = parseInt(req.query.take || 8);
  const skip = parseInt(req.query.skip || 0);
  const { type, providerId, agentId } = req?.user;
  const isProvider = type === "PROVIDER";
  const isAgent = type === "AGENT";
  const searchQuery = req.query.q || "";

  const where = {
    AND: [
      isProvider && !req.query.providerId
        ? { providerId: parseInt(providerId) }
        : isAgent
        ? { agentId: parseInt(agentId) }
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
      agent: true,
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
router.put("/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { name, username, address, phone} = req.body;

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { name, username, address, phone},
  });

  res.json(seller);
});

// Update seller cative
router.put("/active/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  const seller = await prisma.seller.update({
    where: { id: parseInt(id) },
    data: { active },
  });

  res.json(seller);
});

router.put("/reset-password/:id", dashboardAuth, async (req, res) => {
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

module.exports = router;
