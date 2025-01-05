const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const agentAuth = require("../../middleware/agentAuth");
const router = express.Router();

// Create Card
router.post("/", providerAuth, async (req, res) => {
  const { price, agentId, cardId, companyPrice, sellerPrice } = req.body;
  try {
    const card = await prisma.card.findUnique({
      where: {
        id: cardId,
      },
    });
    const agentCard = await prisma.agentCard.create({
      data: {
        price,
        providerId: card?.providerId,
        cardTypeId: card?.cardTypeId,
        agentId,
        cardId,
        companyPrice,
        sellerPrice,
      },
    });
    res.json(agentCard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all Cards
router.get("/", agentAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const agentId = parseInt(req.query.agentId);
    const isAgent = req.user.type === "AGENT";

    if (isAgent && parseInt(req.user.agentId) !== agentId) {
      return res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
    }
    const where = {
      agentId: parseInt(req.query.agentId) || undefined,
    };

    let agent = null;
    if (req.query.agentId) {
      agent = await prisma.agent.findUnique({
        where: {
          id: parseInt(req.query.agentId),
        },
      });
    }

    const total = await prisma.agentCard.count({ where });
    const cards = await prisma.agentCard.findMany({
      where,
      include: {
        cardType: true,
        provider: true,
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });
    res.json({ data: cards, total, agent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/agent", dashboardAuth, async (req, res) => {
  try {
    const { type, agentId } = req?.user;

    if (type !== "AGENT") {
      return res
        .status(403)
        .json({ message: "Only agents can access their cards." });
    }

    const cards = await prisma.agentCard.findMany({
      where: {
        agentId: parseInt(agentId),
      },
      orderBy: {
        createtAt: "desc",
      },
    });

    res.json({ data: cards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// // Update Card by ID
// router.put("/:id", dashboardAuth, async (req, res) => {
//   const { id } = req.params;
//   const { price, providerId, cardTypeId, companyPrice } = req.body;
//   const { type } = req?.user;
//   const isProvider = type === "PROVIDER";
//   try {
//     const card = await prisma.card.update({
//       where: { id: Number(id) },
//       data: isProvider
//         ? { price }
//         : { price, providerId, cardTypeId, companyPrice },
//     });
//     res.json(card);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

router.put("/:id", agentAuth, async (req, res) => {
  const { id } = req.params;
  const { price, cardId, companyPrice, sellerPrice } = req.body;
  const { type } = req?.user;

  const isProvider = type === "PROVIDER";
  const isAgent = type === "AGENT";
  const isAdmin = type === "ADMIN";

  const card = await prisma.card.findUnique({
    where: {
      id: cardId,
    },
  });

  if (!isAdmin && !isProvider && !isAgent) {
    return res.status(403).json({ message: "User type not authorized" });
  }

  try {
    const updatedCard = await prisma.agentCard.update({
      where: { id: Number(id) },
      data: isAgent
        ? { price, sellerPrice }
        : {
            price,
            cardTypeId: card?.cardTypeId,
            cardId,
            companyPrice,
            sellerPrice,
          },
    });

    res.json(updatedCard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
