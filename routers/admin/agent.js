const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const adminAuth = require("../../middleware/adminAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const providerAuth = require("../../middleware/providerAuth");
const agentAuth = require("../../middleware/agentAuth");
const router = express.Router();

// insert Agent
router.post("/", providerAuth, async (req, res) => {
  const { name, phone, address, username, password, providerId } = req.body;

  try {
    // Hash the admin password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the admin account
    const admin = await prisma.admin.create({
      data: {
        name,
        username,
        password: hashedPassword,
        type: "AGENT",
      },
    });

    // Create the agent with the created admin account
    const agent = await prisma.agent.create({
      data: {
        name,
        phone,
        address,
        adminId: admin.id,
        providerId: parseInt(providerId),
      },
    });
    res.status(201).json({ agent, admin });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Error creating Agent and admin account" });
  }
});

// Update Agent
router.put("/:id", providerAuth, dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, providerId } = req.body;

  const agent = await prisma.agent.update({
    where: { id: parseInt(id) },
    data: { name, address, phone, providerId },
  });

  res.json(agent);
});

router.put("/reset-password/:id", providerAuth, adminAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const agent = await prisma.agent.findUnique({
      where: { id: parseInt(id) },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const agentAdmin = agent.adminId;

    const updatedAdmin = await prisma.admin.update({
      where: { id: parseInt(agentAdmin) },
      data: { password: hashedPassword },
    });

    res.json({
      message: "Password updated successfully",
      provider: updatedAdmin,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: "Error updating password" + error.message });
  }
});

// Read all Providers
router.get("/", agentAuth, async (req, res) => {
  try {
    const providerId = req?.user?.providerId;
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);

    let where = {
      AND: [
        {
          providerId:
            req?.user?.type === "ADMIN"
              ? parseInt(req.query.providerId) || undefined
              : parseInt(providerId),
        },
      ],
    };

    const total = await prisma.agent.count({ where });
    const agents = await prisma.agent.findMany({
      where,
      include: {
        admin: true,
        provider: true,
        _count: {
          select: {
            sellers: true, // Counts the number of sellers for each agent
          },
        },
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });
    res.json({ data: agents, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update agent cative
router.put("/active/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  const agent = await prisma.agent.update({
    where: { id: parseInt(id) },
    data: { active },
  });

  res.json(agent);
});

router.get("/about/:id", dashboardAuth, async (req, res) => {
  const agentId = req.params.id;
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: parseInt(agentId) },
      include: {
        provider: true,
      },
    });
    agent.address = agent.provider.address;
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/summary/:id", dashboardAuth, async (req, res) => {
  const agentId = req.params.id;

  if (!agentId) {
    return res.status(400).json({ error: "Provider ID is required" });
  }
  try {
    const agent = await prisma.agent.findUnique({
      where: { id: Number(agentId) },
      select: { providerId: true },
    });

    if (!agent.providerId) {
      return res.status(404).json({ error: "provider not found" });
    }

    const providerId = agent.providerId;

    const cards = await prisma.card.findMany({
      where: {
        providerId: Number(providerId),
      },
      select: {
        id: true,
        cardType: {
          select: {
            companyCardID: true,
          },
        },
      },
    });

    const companyCardIds = Array.from(
      new Set(cards.map((card) => card.cardType.companyCardID))
    );

    if (companyCardIds.length === 0) {
      return res.status(404).json({ error: "No cards found for the provider" });
    }

    const formData = new FormData();
    formData.append("companyCardIds", JSON.stringify(companyCardIds));

    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/v1/client/card-summary",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res
        .status(response.status)
        .json({ error: `External API error: ${errorText}` });
    }

    const externalResponseData = await response.json();

    res.status(200).json({
      message: "Summary fetched successfully",
      data: externalResponseData,
    });
  } catch (error) {
    console.error("Error fetching card summary:", error.message);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the summary" });
  }
});

router.put("/update-price/:cardId", dashboardAuth, async (req, res) => {
  const { cardId } = req.params;
  const { agentPrice } = req.body;
  const agent = req?.user;

  try {
    const agentInfo = await prisma.agent.findUnique({
      where: { id: agent.agentId },
    });

    if (!agentInfo) {
      return res.status(400).json({ error: "Agent not found" });
    }

    const card = await prisma.agentCard.findUnique({
      where: { id: parseInt(cardId) },
    });
    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    if (card.providerId !== agentInfo.providerId) {
      return res
        .status(403)
        .json({ error: "Agent and card do not belong to the same provider" });
    }

    const updatedCard = await prisma.agentCard.update({
      where: { id: parseInt(cardId) },
      data: {
        price: agentPrice,
      },
    });

    res.json({ message: "Agent price updated successfully", updatedCard });
  } catch (error) {
    console.error("Error updating agent price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
