const express = require("express");
const prisma = require("../../prismaClient");
const dashboardAuth = require("../../middleware/dashboardAuth");
const router = express.Router();

// Create Wallet
router.post("/", dashboardAuth, async (req, res) => {
  const { amount, sellerId, date, from } = req.body;
  try {
    if (!from) return res.status(400).json({ error: "Data Error!" });
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

    if (
      req.user?.type !== "ADMIN" &&
      from === "PROVIDER" &&
      parseInt(req.user.providerId) !== seller?.providerId
    ) {
      return res.status(400).json({ error: "لاتصير لوتي!." });
    }

    if (from === "PROVIDER" && provider.walletAmount < parseInt(amount)) {
      return res
        .status(400)
        .json({ error: "Provider has insufficient balance" });
    }

    const wallet = await prisma.wallet.create({
      data: {
        amount,
        sellerId: parseInt(sellerId),
        date: date || new Date(),
        providerId: provider.id,
      },
    });

    await prisma.$transaction(async (prisma) => {
      if (from === "PROVIDER") {
        await prisma.provider.update({
          where: {
            id: provider.id,
          },
          data: {
            walletAmount: provider.walletAmount - parseInt(amount),
          },
        });
      }

      await prisma.seller.update({
        where: {
          id: parseInt(sellerId),
        },
        data: {
          walletAmount: seller.walletAmount + parseInt(amount),
        },
      });
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
