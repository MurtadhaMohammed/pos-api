const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const providerAuth = require("../../middleware/providerAuth");
const agentAuth = require("../../middleware/agentAuth");
const router = express.Router();

//create wallet
router.post("/", providerAuth, async (req, res) => {
  const { amount, agentId, date } = req.body;
  try {
    const agent = await prisma.agent.findUnique({
      where: {
        id: parseInt(agentId),
      },
      include: {
        provider: true,
      },
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (
      req.user?.type !== "ADMIN" &&
      parseInt(req.user.providerId) !== agent?.providerId
    ) {
      return res.status(400).json({ error: "لاتصير لوتي!." });
    }

    if (agent?.provider?.walletAmount < parseInt(amount)) {
      return res
        .status(400)
        .json({ error: "Provider has insufficient balance" });
    }

    const agentWallet = await prisma.agentWallet.create({
      data: {
        amount: parseFloat(amount),
        agentId: parseInt(agentId),
        date: date || new Date(),
      },
    });

    await prisma.$transaction(async (prisma) => {
      await prisma.provider.update({
        where: {
          id: agent?.providerId,
        },

        data: {
          walletAmount: {
            decrement: parseInt(amount),
          },
        },
      });

      await prisma.agent.update({
        where: {
          id: parseInt(agentId),
        },
        data: {
          walletAmount: {
            increment: parseFloat(amount),
          },
        },
      });
    });

    res.status(201).json(agentWallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", agentAuth, async (req, res) => {
  try {
    // const providerId = req?.user?.providerId;
    const take = parseInt(req.query.take || 10);
    const skip = parseInt(req.query.skip || 0);
    const agentId = parseInt(req.query.agentId) || undefined;
    const isAgent = req.user.type === "AGENT";
    //const isProvider = req.user.type === "PROVIDER";

    if (isAgent && parseInt(req.user.agentId) !== agentId) {
      return res
        .status(403)
        .json({ error: "You do not have permission to perform this action" });
    }

    let where = {
      agentId,
    };

    let agent = null;
    if (agentId) {
      agent = await prisma.agent.findUnique({
        where: {
          id: agentId,
        },
      });
    }

    const total = await prisma.agentWallet.count({ where });
    const wallets = await prisma.agentWallet.findMany({
      where,
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
      include: {
        agent: {
          include: {
            provider: true,
          },
        },
      },
    });

    res.json({ data: wallets, total, agent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", providerAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const wallet = await prisma.agentWallet.findUnique({
      where: { id: Number(id) },
      include: {
        agent: true,
      },
    });

    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    if (
      req.user?.type !== "ADMIN" &&
      parseInt(req.user.providerId) !== wallet?.agent?.providerId
    ) {
      return res.status(400).json({ error: "لاتصير لوتي!." });
    }

    await prisma.$transaction(async (prisma) => {
      // Delete the agent wallet record
      await prisma.agentWallet.delete({
        where: { id: Number(id) },
      });

      // Update the agent's wallet amount
      await prisma.agent.update({
        where: { id: wallet.agentId },
        data: {
          walletAmount: {
            decrement: wallet.amount,
          },
        },
      });

      // Update the provider's wallet amount
      await prisma.provider.update({
        where: { id: wallet?.agent?.providerId },
        data: {
          walletAmount: {
            increment: wallet.amount,
          },
        },
      });
    });

    res.json({ message: "Wallet deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
