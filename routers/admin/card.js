const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Card
router.post("/", adminAuth, async (req, res) => {
  const { price, providerId, cardTypeId, companyPrice, sellerPrice } = req.body;
  try {
    const card = await prisma.card.create({
      data: { price, providerId, cardTypeId, companyPrice, sellerPrice },
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
  const { companyCardTypeId, quantity, sellerId } = req.body;

  if (!companyCardTypeId) {
    return res.status(400).json({ message: "companyCardTypeId is required" });
  }

  const qty = Math.min(quantity || 1, 100);

  if (quantity > 100) {
    return res.status(400).json({ error: "Maximum quantity is 100." });
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

    if (!sellerId) {
      return res.status(400).json({ error: "Seller Id missing" });
    }

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

    if (!card) {
      return res.status(500).json({
        error: "No card found!",
      });
    }

    const cardPrice = card?.price;
    const companyPrice = card?.companyPrice;

    if (seller.walletAmount < cardPrice * qty) {
      return res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    // Make a request to the external API
    const formdata = new FormData();
    formdata.append("companyCardTypeId", companyCardTypeId);
    formdata.append("quantity", qty);

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
  const {
    hold_id,
    sellerId,
    providerCardID,
    providerId,
    quantity = 1,
    bulk,
  } = req.body;

  if (!hold_id) {
    return res.status(400).json({ message: "hold_id is required" });
  }

  if (!sellerId) {
    return res.status(400).json({ error: "Seller Id missing" });
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

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const cardPrice = card?.price;
    const companyPrice = card?.companyPrice;
    const totalCost = companyPrice * quantity;

    if (seller?.walletAmount < totalCost) {
      return res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    const formdata = new FormData();
    formdata.append("hold_id", hold_id);
    formdata.append("quantity", quantity);

    if (bulk) {
      formdata.append("bulk", bulk);
    }

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

    let payment;
    if (response.status === 200 && !data.error) {
      payment = await prisma.payment.create({
        data: {
          provider: {
            connect: { id: parseInt(providerId) },
          },
          seller: {
            connect: { id: parseInt(sellerId) },
          },
          companyCardID: data[0]?.id,
          price: cardPrice,
          companyPrice,
          qty: quantity || 1,
          providerCardID: parseInt(providerCardID),
          item: data,
        },
      });

      await prisma.seller.update({
        where: {
          id: parseInt(sellerId),
        },
        data: {
          walletAmount: seller.walletAmount - totalCost,
          paymentAmount: seller.paymentAmount + totalCost,
        },
      });
    }

    // Send back the response from the external API
    res
      .status(response.status)
      .json({ ...data, paymentId: payment?.id, totalCost: totalCost });
  } catch (error) {
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      error: error.message,
    });
  }
});

module.exports = router;
