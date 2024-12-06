const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

//create wallet
router.post("/", adminAuth, async (req, res) => {
  const { amount, providerId, date } = req.body;
  try {
    const provider = await prisma.provider.findUnique({
      where: {
        id: parseInt(providerId),
      },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const providerWallet = await prisma.providerWallet.create({
      data: {
        amount: parseFloat(amount),
        providerId: parseInt(providerId),
        date: date || new Date(),
      },
    });

    await prisma.provider.update({
      where: {
        id: parseInt(providerId),
      },
      data: {
        walletAmount: (provider.walletAmount || 0) + parseFloat(amount),
      },
    });

    res.status(201).json(providerWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", adminAuth, async (req, res) => {
    try {
      const take = parseInt(req.query.take || 10);
      const skip = parseInt(req.query.skip || 0);
      const total = await prisma.providerWallet.count();
      const wallets = await prisma.providerWallet.findMany({
        take,
        skip,
        orderBy: {
          createtAt: "desc",
        },
        include: {
          provider: true,
        },
      });
  
      res.json({ data: wallets, total });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  

router.get("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const wallet = await prisma.providerWallet.findUnique({
      where: { id: Number(id) },
      include: { provider: true },
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  try {
    
    const oldWallet = await prisma.providerWallet.findUnique({
      where: { id: Number(id) },
    });

    if (!oldWallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const updatedWallet = await prisma.providerWallet.update({
      where: { id: Number(id) },
      data: { amount: parseFloat(amount) },
    });

    const provider = await prisma.provider.findUnique({
      where: { id: oldWallet.providerId },
    });

    const newBalance =
      (provider.walletAmount || 0) -
      oldWallet.amount +
      parseFloat(amount);

    await prisma.provider.update({
      where: { id: oldWallet.providerId },
      data: { walletAmount: newBalance },
    });

    res.json(updatedWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", adminAuth , async (req, res) => {
  const { id } = req.params;
  try {
    const wallet = await prisma.providerWallet.findUnique({
      where: { id: Number(id) },
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    await prisma.providerWallet.delete({ where: { id: Number(id) } });

    const provider = await prisma.provider.findUnique({
      where: { id: wallet.providerId },
    });

    const newBalance = (provider.walletAmount || 0) - wallet.amount;

    await prisma.provider.update({
      where: { id: wallet.providerId },
      data: { walletAmount: newBalance },
    });

    res.json({ message: "Wallet deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
