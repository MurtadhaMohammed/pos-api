const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("../provider/middleware/providerAuth");
const { generateCustomHoldId } = require("../../helper/generateHoldId");
const router = express.Router();

router.post("/", providerAuth, async (req, res) => {
  const { amount, sellerId, date, note } = req.body;
  const { providerId, permissions } = req.user;
  const userType = req.user.type

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("create_seller_wallet")
      ) 
    ){
      return res.status(403).json({ error: "No permission to create seller wallet" });
    }

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

    if (parseInt(providerId) !== seller?.providerId) {
      return res.status(403).json({ error: "You can only manage your own sellers" });
    }

    let HoldId = generateCustomHoldId();

    const result = await prisma.$transaction(async (prisma) => {
      const updatedSeller = await prisma.seller.updateMany({
        where: { id: sellerIdInt, holdId: null },
        data: { holdId: HoldId, holdAt: new Date() },
      });

      if (updatedSeller.count === 0) {
        throw new Error("Transaction in progress");
      }

      const provider = await prisma.provider.findUnique({
        where: { id: seller.providerId },
      });

      if (!provider) {
        throw new Error("Provider not found");
      }

      const amountInt = parseInt(amount);
      if (provider.walletAmount < amountInt) {
        throw new Error("Provider has insufficient balance");
      }

      const wallet = await prisma.wallet.create({
        data: {
          amount: amountInt,
          sellerId: sellerIdInt,
          date: date ? new Date(date) : new Date(),
          providerId: provider.id,
          holdId: HoldId,
          note,
        },
      });

      await prisma.provider.update({
        where: { id: provider.id },
        data: { walletAmount: { decrement: amountInt } },
      });

      await prisma.seller.update({
        where: { id: sellerIdInt },
        data: { walletAmount: { increment: amountInt } },
      });

      return wallet;
    });

    res.json(result);
  } catch (error) {
    if (error.message && error.message.includes("Transaction already closed")) {
      return res.status(500).json({
        error: "Transaction already closed.",
      });
    }
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    }
  }
});

router.post("/resetHold", providerAuth, async (req, res) => {
  const { sellerId } = req.body;
  const { providerId } = req.user;

  if (!sellerId) {
    return res.status(400).json({ message: "No seller id provided!" });
  }

  try {

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

    if (parseInt(providerId) !== seller?.providerId) {
      return res.status(403).json({ error: "You can only manage your own sellers" });
    }

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

router.get("/", providerAuth, async (req, res) => {
  const providerId = req.user.providerId;
  const permissions = req.user.permissions;
  const userType = req.user.userType;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_seller_wallet")      ) 
    ){
      return res.status(403).json({ error: "No permission to read seller wallet" });
    }

    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const sellerId = parseInt(req.query.sellerId) || undefined;

    const where = {
      providerId: parseInt(providerId),
      sellerId,
    };

    let seller = null;
    if (sellerId) {
      seller = await prisma.seller.findUnique({
        where: {
          id: sellerId,
          providerId: parseInt(providerId)
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

router.get("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const providerId = req.user.providerId;
  const permissions = req.user.permissions;
  const userType = req.user.userType;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_seller_wallet")      ) 
    ){
      return res.status(403).json({ error: "No permission to read seller wallet" });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { 
        id: Number(id),
        providerId: parseInt(providerId)
      },
      include: {
        seller: true
      }
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet transaction not found or you don't have access to it" });
    }

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  const { providerId, permissions } = req.user;

  try {
    if (!permissions.includes("superadmin") && !permissions.includes("delete_seller_wallet")) {
      return res.status(403).json({ error: "No permission to delete seller wallet" });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { 
        id: Number(id),
        providerId: parseInt(providerId)
      },
      include: {
        seller: true,
      },
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet transaction not found or you don't have access to it" });
    }

    if (wallet.seller?.walletAmount < wallet.amount) {
      return res.status(400).json({ error: "Seller has already spent the wallet amount" });
    }

    if (wallet.type === "REFUND") {
      return res.status(400).json({ error: "Cannot delete refund transactions" });
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.provider.update({
        where: {
          id: parseInt(providerId),
        },
        data: {
          walletAmount: {
            increment: parseInt(wallet.amount),
          },
        },
      });

      await prisma.seller.update({
        where: {
          id: wallet.sellerId,
        },
        data: {
          walletAmount: {
            decrement: parseInt(wallet.amount),
          },
        },
      });

      await prisma.wallet.delete({ 
        where: { 
          id: Number(id),
          providerId: parseInt(providerId)
        } 
      });
    });

    res.json({ message: "Wallet transaction deleted and amount returned" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
