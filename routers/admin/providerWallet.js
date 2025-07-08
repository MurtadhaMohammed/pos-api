const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

//create wallet
router.post("/", adminAuth, async (req, res) => {
  const { amount, providerId, date } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("create_provider_wallet")
      )
    ) {
      return res.status(400).json({ error: "No permission to create provider wallet" });
    }

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

router.get("/", providerAuth, async (req, res) => {

  const userType = req.user.type;
  const permissions = req.user.permissions || [];

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_provider_wallet")
      )
    ) {
      return res.status(400).json({ error: "No permission to read provider wallet" });
    }

    const take = parseInt(req.query.take || 10);
    const skip = parseInt(req.query.skip || 0);
    const providerId = parseInt(req.query.providerId) || undefined;
    const isProvider = req.user.type === "PROVIDER";

    if (isProvider && parseInt(req.user.providerId) !== providerId) {
      return res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
    }

    let provider = null;
    if (providerId) {
      provider = await prisma.provider.findUnique({
        where: {
          id: providerId,
        },
      });
    }

    const total = await prisma.providerWallet.count({
      where: {
        providerId,
      },
    });
    const wallets = await prisma.providerWallet.findMany({
      where: {
        providerId,
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
      include: {
        provider: true,
      },
    });

    res.json({ data: wallets, total, provider });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const userType = req.user.type;
  const permissions = req.user.permissions || [];

  
  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_provider_wallet")
      )
    ) {
      return res.status(400).json({ error: "No permission to read provider wallet" });
    }

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
  const userType = req.user.type;
  const permissions = req.user.permissions || [];

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("update_provider_wallet")
      )
    ) {
      return res.status(400).json({ error: "No permission to update provider wallet" });
    }

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
      (provider.walletAmount || 0) - oldWallet.amount + parseFloat(amount);

    await prisma.provider.update({
      where: { id: oldWallet.providerId },
      data: { walletAmount: newBalance },
    });

    res.json(updatedWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const userType = req.user.type;
  const permissions = req.user.permissions || [];

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("delete_provider_wallet")
      )
    ) {
      return res.status(400).json({ error: "No permission to delete provider wallet" });
    }

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
