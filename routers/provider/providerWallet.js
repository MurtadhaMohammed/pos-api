const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();

router.get("/", providerAuth, async (req, res) => {
  try {
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

module.exports = router;
