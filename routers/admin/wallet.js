const express = require("express");
const prisma = require("../../prismaClient");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Wallet
router.post("/", dashboardAuth, async (req, res) => {
  const { amount, sellerId, date } = req.body;
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
      return res.status(404).json({ error: "Seller not found" });
    }

    const provider = seller.provider;

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    if (provider.walletAmount < parseInt(amount)) {
      return res.status(400).json({ error: "Provider has insufficient balance" });
    }

    const wallet = await prisma.wallet.create({
      data: {
        amount,
        sellerId: parseInt(sellerId),
        date: date || new Date(),
        providerId: provider.id,
      },
    });

    await prisma.provider.update({
      where: {
        id: provider.id,
      },
      data: {
        walletAmount: provider.walletAmount - parseInt(amount),
      },
    });

    await prisma.seller.update({
      where: {
        id: parseInt(sellerId),
      },
      data: {
        walletAmount: seller.walletAmount + parseInt(amount),
      },
    });
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read all Wallets
router.get("/", dashboardAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip | 0);
    const { type, providerId } = req?.user;
    const isProvider = type === "PROVIDER";

    const where = isProvider
      ? {
          providerId: parseInt(providerId),
        }
      : {};
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
    res.json({ data: wallets, total });
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

// Update Wallet by ID
router.put("/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { amount, sellerId } = req.body;
  try {
    const oldWallet = await prisma.wallet.findUnique({
      where: { id: Number(id) },
    });

    const wallet = await prisma.wallet.update({
      where: { id: Number(id) },
      data: { amount, sellerId },
    });

    const seller = await prisma.seller.findUnique({
      where: {
        id: parseInt(sellerId),
      },
    });

    let newWalletAmount = seller.walletAmount - oldWallet.amount;

    await prisma.seller.update({
      where: {
        id: parseInt(sellerId),
      },
      data: {
        walletAmount: newWalletAmount + parseInt(amount),
      },
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
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: wallet.providerId },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    await prisma.provider.update({
      where: { id: wallet.providerId },
      data: {
        walletAmount: provider.walletAmount + wallet.amount,
      },
    });

    await prisma.wallet.delete({ where: { id: Number(id) } });

    res.json({ message: "Wallet deleted and amount returned to provider" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
