const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const { holdCard } = require("../../helper/holdCard");
const { purchase } = require("../../helper/purchase");
const { auditLog } = require("../../helper/audit");
const router = express.Router();

router.get("/:providerId", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  const providerId = parseInt(req.params.providerId, 10);

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("read_provider_cards"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to read provider cards" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    const take = parseInt(req.query.take) || 8;
    const skip = parseInt(req.query.skip) || 0;

    const where = { providerId };
    const total = await prisma.customPrice.count({ where });

    const customPrice = await prisma.customPrice.findMany({
      where,
      include: {
        plan: true,
      },
      take,
      skip,
    });

    if (customPrice.length === 0) {
      return res.json({ data: [], total });
    }

    // Fetch real-time stock counts dynamically
    const results = await Promise.all(
      customPrice.map(async (c) => {
        const stockCount = await prisma.stock.count({
          where: {
            planId: c.planId,
            providerId,
            status: "Ready",
            active: true,
            archive: {
              active: true,
            },
          },
        });

        return {
          ...c,
          count: stockCount,
        };
      })
    );

    res.json({ data: results, provider, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (
    userType !== "ADMIN" ||
    (!permissions.includes("superadmin") &&
      !permissions.includes("create_provider_cards"))
  ) {
    return res
      .status(400)
      .json({ error: "No permission to update provider cards" });
  }

  try {
    const { price, companyPrice, sellerPrice, providerId, planId } = req.body;

    const isExist = await prisma.customPrice.findFirst({
      where: {
        providerId,
        planId,
      },
    });

    if (isExist) {
      return res
        .status(500)
        .json({ error: "هذه الفئة موجوده اصلا، اختر فئة اخرى!." });
    }
    const customPrice = await prisma.customPrice.create({
      data: {
        price,
        companyPrice,
        sellerPrice,
        providerId,
        planId,
      },
    });
    res.json({ data: customPrice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await auditLog(req, res, "ADMIN", "CREATE_PROVIDER_CARDS");
  }
});

router.put("/:id", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("update_provider_cards"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to update provider cards" });
    }

    const { type, providerId } = req?.user;
    const id = parseInt(req.params.id, 10);
    const { price, companyPrice, sellerPrice } = req.body;

    let data = {};
    if (type === "ADMIN") {
      data = {
        price,
        companyPrice,
        sellerPrice,
      };
    }

    if (type === "PROVIDER") {
      data = {
        price,
        sellerPrice,
      };
    }

    const customPrice = await prisma.customPrice.findUnique({
      where: {
        id,
      },
    });

    if (type === "PROVIDER" && Number(providerId) !== customPrice.providerId) {
      return res.status(401).json({ error: "لاتصير لوتي !." });
    }

    const updatedCustomPrice = await prisma.customPrice.update({
      where: {
        id,
      },
      data,
    });
    res.json({ data: updatedCustomPrice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await auditLog(req, res, "ADMIN", "UPDATE_PROVIDER_CARDS");
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("provider_cards_status"))
    ) {
      return res
        .status(400)
        .json({ error: "No permission to update provider cards" });
    }

    const id = parseInt(req.params.id, 10);
    const { active } = req.body;
    const customPrice = await prisma.customPrice.update({
      where: {
        id,
      },
      data: {
        active,
      },
    });
    res.json({ data: customPrice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await auditLog(req, res, "ADMIN", "UPDATE_PROVIDER_CARDS_STATUS");
  }
});

router.post("/cardHolder", adminAuth, async (req, res) => {
  const { providerCardId, quantity = 1, sellerId } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("create_payment"))
    ) {
      return res.status(400).json({ error: "No permission to create payment" });
    }

    let resp = await holdCard(providerCardId, quantity, sellerId, true);
    if (resp.error) {
      return res.status(500).json(resp);
    }
    res.status(200).json(resp);
  } catch (error) {
    res.status(500).json({
      walletAmount: 0,
      error: error.message,
    });
  } finally {
    await auditLog(req, res, "ADMIN", "CREATE_HOLD_CARD");
  }
});

router.post("/purchase", adminAuth, async (req, res) => {
  const { hold_id, sellerId } = req.body;
  const { type, providerId } = req?.user;
  const isProvider = type === "PROVIDER";
  const userType = req.user.type;
  const permissions = req.user.permissions || [];
  try {
    if (
      userType !== "ADMIN" ||
      (!permissions.includes("superadmin") &&
        !permissions.includes("create_payment"))
    ) {
      return res.status(400).json({ error: "No permission to create payment" });
    }

    const seller = await prisma.seller.findUnique({
      where: {
        id: sellerId,
      },
    });

    if (isProvider) {
      if (!seller || seller.providerId !== Number(providerId)) {
        return res.status(500).json({ error: "لاتصير لوتي!." });
      }
    }

    let resp = await purchase(hold_id, sellerId);
    if (resp.error) {
      return res.status(500).json(resp);
    }
    res.status(200).json({
      ...resp,
      totalCost: resp.companyPrice * resp?.qty,
      seller: seller,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  } finally {
    await auditLog(req, res, "ADMIN", "CREATE_PURCHASE");
  }
});

module.exports = router;
