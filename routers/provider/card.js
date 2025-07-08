const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const { generateCustomHoldId } = require("../../helper/generateHoldId");
const router = express.Router();

const getPlanDetails = async (cards) => {
    const raw = JSON.stringify({
      planIds: cards.map((el) => el?.cardType?.companyCardID),
    });
  
    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/client/plan-details",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: raw,
      }
    );
    const jsonResp = await response.json();
    let list = cards?.map((el) => {
      el.count = jsonResp?.find(
        (plan) => plan?.planId === el?.cardType?.companyCardID
      )?.count;
      return el;
    });
  
    return list || [];
  };
  
  // Get all cards
  router.get("/", providerAuth, async (req, res) => {
    const { providerId, permissions } = req.user;
  
    try {
      if (!permissions.includes("read_card")) {
        return res.status(403).json({ error: "No permission to read cards" });
      }
  
      const take = parseInt(req.query.take || 8);
      const skip = parseInt(req.query.skip || 0);
  
      const where = {
        providerId: parseInt(providerId),
      };
  
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
  
      let list = await getPlanDetails(cards);
      res.json({ data: list, total });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get card by ID
  router.get("/:id", providerAuth, async (req, res) => {
    const { id } = req.params;
    const providerId = req.user.providerId;
    const permissions = req.user.permissions;
    const userType = req.user.type;
  
    try {
      if (
        userType !== 'PROVIDER' || 
        (
          !permissions.includes("superprovider") &&
          !permissions.includes("read_card")
        )
      ){
        return res.status(403).json({ error: "No permission to read cards" });
      }
  
      const card = await prisma.card.findFirst({
        where: { 
          id: Number(id),
          providerId: parseInt(providerId)
        },
        include: {
          cardType: true,
          provider: true
        }
      });
  
      if (!card) {
        return res.status(404).json({ error: "Card not found or you don't have access to it" });
      }
  
      res.json(card);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Update card
  router.put("/:id", providerAuth, async (req, res) => {
    const { id } = req.params;
    const { price, sellerPrice, active } = req.body;
    const { providerId, permissions } = req.user;
  
    try {
      if (!permissions.includes("update_card")) {
        return res.status(403).json({ error: "No permission to update cards" });
      }
  
      const currentCard = await prisma.card.findFirst({
        where: { 
          id: Number(id),
          providerId: parseInt(providerId)
        }
      });
  
      if (!currentCard) {
        return res.status(404).json({ error: "Card not found or you don't have access to it" });
      }
  
      const card = await prisma.card.update({
        where: { id: Number(id) },
        data: { 
          price, 
          sellerPrice, 
          active: active !== undefined ? active : !currentCard.active 
        },
        include: {
          cardType: true,
          provider: true
        }
      });
  
      res.json(card);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

router.post("/cardHolder", providerAuth, async (req, res) => {
    const { companyCardTypeId, quantity, sellerId } = req.body;
    const userType = req.user.type;
    const permissions = req.user.permissions;

    if (
        userType !== 'PROVIDER' || 
        (
          !permissions.includes("superprovider") &&
          !permissions.includes("create_payment")
        )
      ){
        return res.status(403).json({ error: "No permission to hold cards" });
    }
  
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
          active: true,
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
      const sellerPrice = card?.sellerPrice;
  
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
          sellerPrice,
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
  
router.post("/purchase", providerAuth, async (req, res) => {
    const { hold_id, providerCardID, sellerId } = req.body;
    const providerId = req.user.providerId;
    const permissions = req.user.permissions;
    const userType = req.user.type;
  
    if (
        userType !== 'PROVIDER' || 
        (
          !permissions.includes("superprovider") &&
          !permissions.includes("create_payment")
        )
      ){
      return res.status(400).json({ error: "No permission to purchase cards" });
    }
  
    try {
  
      const seller = await prisma.seller.findFirst({
        where: {
          id: Number(sellerId),
          providerId: parseInt(providerId)
        }
      });
  
      if (!seller) {
        return res.status(404).json({ error: "Seller not found or you don't have access to it" });
      }
  
      const hasAgent = !!seller?.agentId;
      const card = await prisma[hasAgent ? "agentCard" : "card"].findFirst({
        where: {
          id: Number(providerCardID),
          providerId: parseInt(providerId),
          ...(hasAgent ? { agentId: seller?.agentId } : {})
        },
        ...(hasAgent
          ? {
              include: {
                card: true,
              },
            }
          : {})
      });
  
      if (!card) {
        return res.status(404).json({ error: "Card not found or you don't have access to it" });
      }
  
      const cardPrice = card?.price;
      const companyPrice = card?.sellerPrice;
  
      const formdata = new FormData();
      formdata.append("hold_id", hold_id);
  
      const response = await fetch(
        "https://client.nojoomalrabiaa.com/api/client/purchase",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
          },
          body: formdata,
        }
      );
  
      let data = await response.json();
  
      if (response.status === 200 && !data[0].error) {
        const payment = await prisma.payment.create({
          data: {
            provider: {
              connect: { id: parseInt(providerId) },
            },
            seller: {
              connect: { id: parseInt(sellerId) },
            },
            agent: seller?.agentId
              ? {
                  connect: { id: seller.agentId },
                }
              : undefined,
            companyCardID: data[0]?.id,
            price: cardPrice,
            companyPrice,
            localCard: card,
            qty: data?.length,
            providerCardID: parseInt(providerCardID),
            item: data,
          },
        });
  
        const updatedSeller = await prisma.seller.update({
          where: {
            id: parseInt(sellerId),
          },
          data: {
            walletAmount: {
              decrement: companyPrice * data?.length,
            },
            paymentAmount: {
              increment: companyPrice * data?.length,
            },
          },
        });
  
        let item = payment?.item[0];
        let code = payment?.item?.map((d) => d.code);
  
        const resp = {
          id: item?.id,
          paymentId: payment?.id,
          price: payment?.price,
          qty: payment?.qty,
          createdAt: payment?.createtAt,
          walletAmount: updatedSeller?.walletAmount,
          code,
          name: item?.details?.title,
          totalCost: companyPrice * payment?.qty,
          seller: seller,
        };
  
        res.status(200).json(resp);
      } else {
        res.status(response.status).json(data[0]);
      }
    } catch (error) {
      console.error("Error making request to external API:", error.message);
      res.status(500).json({
        message: "Error making request to external API",
        error: error.message,
      });
    }
  });

module.exports = router;