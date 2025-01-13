const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Card
router.post("/", adminAuth, async (req, res) => {
  const { price, providerId, cardTypeId, companyPrice } = req.body;
  try {
    const card = await prisma.card.create({
      data: { price, providerId, cardTypeId, companyPrice },
    });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all Cards
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const providerId = parseInt(req.query.providerId);

    const isProvider = req.user.type === "PROVIDER";

    if (isProvider && parseInt(req.user.providerId) !== providerId) {
      return res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
    }

    const where = {
      providerId: parseInt(req.query.providerId) || undefined,
    };

    let provider = null;
    if (req.query.providerId) {
      provider = await prisma.provider.findUnique({
        where: {
          id: parseInt(req.query.providerId),
        },
      });
    }

    const total = await prisma.card.count({ where });
    const cards = await prisma.card.findMany({
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
    res.json({ data: cards, total, provider });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Card by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const card = await prisma.card.findUnique({ where: { id: Number(id) } });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Card by ID
router.get("/:providerId/:cardTypeId", async (req, res) => {
  const { providerId, cardTypeId } = req.params;
  try {
    const card = await prisma.card.findFirst({
      where: { providerId: Number(providerId), cardTypeId: Number(cardTypeId) },
    });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Card by ID
router.put("/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { price, providerId, cardTypeId, companyPrice, sellerPrice } = req.body;
  const { type } = req?.user;
  const isProvider = type === "PROVIDER";
  try {
    const card = await prisma.card.update({
      where: { id: Number(id) },
      data: isProvider
        ? { price, sellerPrice }
        : { price, providerId, cardTypeId, companyPrice, sellerPrice },
    });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Card by ID
router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const card = await prisma.card.delete({ where: { id: Number(id) } });
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/cardHolder", dashboardAuth, async (req, res) => {
  const { companyCardTypeId, sellerId } = req.body;
  if (!companyCardTypeId) {
    return res.status(400).json({ message: "companyCardTypeId is required" });
  }

  try {
    const card = await prisma.card.findFirst({
      include: {
        cardType: true,
      },
      where: {
        cardType: {
          companyCardID: parseInt(companyCardTypeId),
        },
      },
    });

    const seller = await prisma.seller.findUnique({
      where: {
        id: parseInt(sellerId),
      },
    });

    if (!seller.active) {
      return res.status(500).json({
        error: "This account is not active!",
      });
    }

    const cardPrice = card?.price ;
    const companyPrice = card?.companyPrice

    if (seller.walletAmount < cardPrice) {
      return res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    // Make a request to the external API
    const formdata = new FormData();
    formdata.append("companyCardTypeId", companyCardTypeId);

    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/client/hold-card",
      // "https://api.nojoomalrabiaa.com/v1/companyDashboard/cardHolder",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formdata,
      }
    );

    let data = await response.json();
    if (response.status === 200) {
      data = {
        ...data[0],
        walletAmount: seller.walletAmount,
        price: cardPrice,
        companyPrice,
      };
    }
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      walletAmount: 0,
      error: error.message,
    });
  }
});

router.post("/purchase", dashboardAuth, async (req, res) => {
  const { hold_id, sellerId, providerCardID, providerId } = req.body;
  if (!hold_id) {
    return res.status(400).json({ message: "hold_id is required" });
  }

  try {
    const card = await prisma.card.findUnique({
      where: {
        id: Number(providerCardID),
      },
    });

    const seller = await prisma.seller.findUnique({
      where: {
        id: Number(sellerId),
      },
    });

    const cardPrice = card?.price;
    const companyPrice = card?.companyPrice;

    if (seller?.walletAmount < cardPrice) {
      res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    // Make a request to the external API
    const formdata = new FormData();
    formdata.append("hold_id", hold_id);

    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/client/purchase",
      // "https://api.nojoomalrabiaa.com/v1/companyDashboard/purchase",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formdata,
      }
    );

    let data = await response.json();
    if (response.status === 200) {
      data = data[0];
    }

    let payment;
    if (!data.error) {
      // const card = await prisma.card.findUnique({
      //   where: {
      //     id: parseInt(providerCardID),
      //   },
      // });

      payment = await prisma.payment.create({
        data: {
          provider: {
            connect: { id: parseInt(providerId) },
          },
          seller: {
            connect: { id: parseInt(sellerId) },
          },
          agentId: seller?.agentId || null,
          companyCardID: data?.id,
          price: cardPrice,
          companyPrice,
          qty: 1,
          providerCardID: parseInt(providerCardID),
          item: data,
        },
      });

      await prisma.seller.update({
        where: {
          id: parseInt(sellerId),
        },
        data: {
          walletAmount: seller.walletAmount - companyPrice,
          paymentAmount: seller.paymentAmount + companyPrice,
        },
      });
    }

    // Send back the response from the external API
    res.status(response.status).json({ ...data, paymentId: payment?.id });
  } catch (error) {
    // Handle errors appropriately
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      error: error.message,
    });
  }
});

module.exports = router;
