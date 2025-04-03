const express = require("express");
const prisma = require("../../prismaClient");
const dashboardAuth = require("../../middleware/dashboardAuth");
const { generateCustomHoldId } = require("../../helper/generateHoldId");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

// Create Wallet
router.post("/", dashboardAuth, async (req, res) => {
  const { amount, sellerId, date, from } = req.body;
  try {
    if (!from) return res.status(400).json({ error: "Data Error!" });
    const sellerIdInt = parseInt(sellerId);
    const seller = await prisma.seller.findUnique({
      where: {
        id: sellerIdInt,
      },
      include: {
        provider: true,
      },
    });

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    if (seller.holdId) {
      return res.status(409).json({
        error: "Transaction in progress",
      });
    }

    if (
      req.user?.type !== "ADMIN" &&
      from === "PROVIDER" &&
      parseInt(req.user.providerId) !== seller?.providerId
    ) {
      return res.status(400).json({ error: "لاتصير لوتي!." });
    }

    let HoldId = generateCustomHoldId();

    const result = await prisma.$transaction(async (prisma) => {
      /// updateMany here is not for updating multiple sellers ... it's a trick to ensure that the update only happens if holdId is null
      const updatedSeller = await prisma.seller.updateMany({
        where: { id: sellerIdInt, holdId: null },
        data: { holdId: HoldId, holdAt: new Date() },
      });

      // If no rows gets updated it means another transaction already sets the holdId
      if (updatedSeller.count === 0) {
        //don't use res.status here cuz it may make an issue in prisma transaction
        throw new Error("Transaction in progress");
      }

      const provider = await prisma.provider.findUnique({
        where: { id: seller.providerId },
      });

      if (!provider) {
        throw new Error("Provider not found");
      }

      const amountInt = parseInt(amount);
      if (from === "PROVIDER" && provider.walletAmount < amountInt) {
        throw new Error("Provider has insufficient balance");
      }

      const wallet = await prisma.wallet.create({
        data: {
          amount: amountInt,
          sellerId: sellerIdInt,
          date: date ? new Date(date) : new Date(),
          providerId: provider.id,
          holdId: HoldId,
        },
      });

      if (from === "PROVIDER") {
        await prisma.provider.update({
          where: { id: provider.id },
          data: { walletAmount: { decrement: amountInt } },
        });
      }

      await prisma.seller.update({
        where: { id: sellerIdInt },
        data: { walletAmount: { increment: amountInt } },
      });

      return wallet;
    });

    res.json(result);
  } catch (error) {
    // to handle prisma error message
    if (error.message && error.message.includes("Transaction already closed")) {
      return res.status(500).json({
        error: "Transaction already closed.",
      });
    }
    // to prevent express from sending the many response to the client at once so it can cuz an issue
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
});

router.post("/resetHold", providerAuth, async (req, res) => {
  const { sellerId } = req.body;

  if (!sellerId) {
    return res.status(400).json({ message: "No seller id provided!" });
  }

  const seller = await prisma.seller.findUnique({
    where: {
      id: parseInt(sellerId),
    },
    include: {
      provider: true,
    },
  });

  if (!seller) {
    return res.status(404).json({ message: "Seller not found!" });
  }

  try {
    if (
      req.user?.type !== "ADMIN" &&
      req.user.providerId !== seller?.providerId
    ) {
      return res.status(403).json({ error: "لاتصير لوتي!." });
    }

    // to handle error if no - hold id - properly instead of crashing
    const updatedSeller = await prisma.seller.updateMany({
      where: {
        id: parseInt(sellerId),
        holdId: { not: null },
      },
      data: {
        holdId: null,
        holdAt: null,
      },
    });

    if (updatedSeller.count === 0) {
      return res.status(409).json({ message: "No active hold to reset." });
    }

    res.json({ message: "Hold successfully reset." });
  } catch (error) {
    console.error("Error resetting hold:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Read all Wallets
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const sellerId = parseInt(req.query.sellerId) || undefined;
    const { type, providerId, agentId } = req?.user;
    const isProvider = type === "PROVIDER";
    const isAgent = type === "AGENT";

    const where = isProvider
      ? {
          providerId: parseInt(providerId),
          sellerId,
        }
      : isAgent
      ? {
          agentId: parseInt(agentId),
          sellerId,
        }
      : {
          sellerId,
        };

    let seller = null;
    if (sellerId) {
      seller = await prisma.seller.findUnique({
        where: {
          id: sellerId,
        },
      });
    }
    const total = await prisma.wallet.count({ where });
    const wallets = await prisma.wallet.findMany({
      where,
      include: {
        seller: {
          include: {
            provider: true,
          },
        },
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });
    res.json({ data: wallets, total, seller });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Wallet by ID
router.get("/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { id: Number(id) },
    });
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Wallet by ID
router.delete("/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const wallet = await prisma.wallet.findUnique({
      where: { id: Number(id) },
      include: {
        Provider: true,
        seller: true,
      },
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const provider = wallet.Provider;
    const from = wallet.from;
    const amount = wallet.amount;
    const sellerId = wallet.sellerId;
    const seller = wallet.seller;

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    if (
      req.user?.type !== "ADMIN" &&
      from === "PROVIDER" &&
      parseInt(req.user.providerId) !== seller?.providerId
    ) {
      return res.status(400).json({ error: "لاتصير لوتي!." });
    }

    if (seller?.walletAmount < amount) {
      return res
        .status(500)
        .json({ error: "You alresy spent your wallet amount!." });
    }

    if (wallet.type === "REFUND") {
      return res.status(500).json({ error: "You cont refund this!." });
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.provider.update({
        where: {
          id: provider.id,
        },
        data: {
          walletAmount: {
            increment: parseInt(amount),
          },
        },
      });

      await prisma.seller.update({
        where: {
          id: parseInt(sellerId),
        },
        data: {
          walletAmount: {
            decrement: parseInt(amount),
          },
        },
      });

      await prisma.wallet.delete({ where: { id: Number(id) } });
    });

    res.json({ message: "Wallet deleted and amount returned." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
