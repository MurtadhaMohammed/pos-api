const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const adminAuth = require("../../middleware/adminAuth");
const dashboardAuth = require("../../middleware/dashboardAuth");
const providerAuth = require("../../middleware/providerAuth");
const router = express.Router();
const FormData = require("form-data");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// insert Provider
router.post("/", adminAuth, async (req, res) => {
  const { name, phone, address, username, password } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  
  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("create_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to create provider" });
    }
    
    // Hash the admin password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the admin account
    const admin = await prisma.admin.create({
      data: {
        name,
        username,
        phone,
        password: hashedPassword,
        type: "PROVIDER",
      },
    });

    // Create the provider with the created admin account
    const provider = await prisma.provider.create({
      data: {
        name,
        phone,
        address,
        adminId: admin.id,
      },
    });

    res.status(201).json({ provider, admin });
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({ error: "Error creating provider and admin account" });
  }
});

// Read all Providers
router.get("/", adminAuth, async (req, res) => {

  const permissions = req.user.permissions || [];
  const userType = req.user.type;
 
  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to read providers" });
    }

    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const q = req.query.q || "";
    const where = q
      ? {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              phone: {
                contains: q,
                mode: "insensitive",
              },
            },
          ],
        }
      : {};
    const total = await prisma.provider.count({ where });
    const providers = await prisma.provider.findMany({
      where,
      include: {
        admin: true,
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });
    res.json({ data: providers, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Read Provider by ID
router.get("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to read provider" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: Number(id) },
    });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Provider by ID
router.put("/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
 
  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("update_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to update provider" });
    }

    const provider = await prisma.provider.update({
      where: { id: Number(id) },
      data: { name, phone, address },
    });
    res.json(provider);
  } catch (error) {
    console.error("Transaction error:", error);
    res.status(500).json({ error: "Failed to update provider/admin" });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("update_provider_status")
      )
    ) {
      return res.status(400).json({ error: "No permission to update provider" });
    }

    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id) },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const updatedProvider = await prisma.provider.update({
      where: { id: parseInt(id) },
      data: {
        active: !provider.active,
      },
    });

    res.json(updatedProvider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/reset-password/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {
    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("reset_password_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to update provider" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(id) },
    });

    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const providerAdmin = provider.adminId;

    const updatedAdmin = await prisma.admin.update({
      where: { id: parseInt(providerAdmin) },
      data: { password: hashedPassword },
    });
    console.log(updatedAdmin);

    res.json({
      message: "Password updated successfully",
      provider: updatedAdmin,
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: "Error updating password" + error.message });
  }
});

// so the provider can see his data in about section
// router.get("/about/:id", dashboardAuth, async (req, res) => {
//   const providerId = req.params.id;
//   try {
//     const provider = await prisma.provider.findUnique({
//       where: { id: parseInt(providerId) },
//     });
//     res.json(provider);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

router.get("/summary/:id", dashboardAuth, async (req, res) => {
  const providerId = req.params.id;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (!providerId) {
    return res.status(400).json({ error: "Provider ID is required" });
  }

  try {

    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("read_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to read provider" });
    }
    const cards = await prisma.card.findMany({
      where: {
        providerId: Number(providerId),
      },
      select: {
        id: true,
        cardType: {
          select: {
            companyCardID: true,
          },
        },
      },
    });

    const companyCardIds = Array.from(
      new Set(cards.map((card) => card.cardType.companyCardID))
    );

    if (companyCardIds.length === 0) {
      return res.status(404).json({ error: "No cards found for the provider" });
    }

    const formData = new FormData();
    formData.append("companyCardIds", JSON.stringify(companyCardIds));

    const response = await fetch(
      "https://client.nojoomalrabiaa.com/api/v1/client/card-summary",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res
        .status(response.status)
        .json({ error: `External API error: ${errorText}` });
    }

    const externalResponseData = await response.json();

    res.status(200).json({
      message: "Summary fetched successfully",
      data: externalResponseData,
    });
  } catch (error) {
    console.error("Error fetching card summary:", error.message);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the summary" });
  }
});

router.put("/update-price/:id", dashboardAuth, async (req, res) => {
  const { id } = req.params;
  const { providerPrice } = req.body;
  const provider = req?.user;
  const userType = req.user.type;
  const providerId = provider.id;

  const permissions = req.user.permissions || [];
  try {
    if (
      userType !== 'ADMIN' || 
      (
        !permissions.includes("superadmin") &&
        !permissions.includes("update_price_provider")
      )
    ) {
      return res.status(400).json({ error: "No permission to update provider price" });
    }
    const card = await prisma.card.findUnique({ where: { id: parseInt(id) } });

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }

    if (card.providerId !== null && card.providerId !== providerId) {
      return res
        .status(400)
        .json({ error: "Provider ID does not match the card's provider" });
    }

    const updatedCard = await prisma.card.update({
      where: { id: parseInt(id) },
      data: { price: providerPrice },
    });

    res.json({ message: "Provider price updated successfully", updatedCard });
  } catch (error) {
    console.error("Error updating provider price:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const dayjs = require("dayjs");
const getDateDifferenceType = require("../../helper/getDateDifferenceType");

router.get("/info/all", adminAuth, async (req, res) => {
  let { filterType, providerId, startDate, endDate } = req.query;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;


  if (userType !== 'ADMIN' || (!permissions.includes("superadmin") && !permissions.includes("statistics"))) {
    return res.status(400).json({ error: "No permission to read provider statistics" });
  }

  if (
    req?.user?.providerId &&
    providerId &&
    parseInt(req?.user?.providerId) !== parseInt(providerId)
  ) {
    return res.status(401).json({ error: "لا تصير لوتي!." });
  }

  // Validate filterType
  if (!["day", "week", "month", "year", "yesterday"].includes(filterType)) {
    return res.status(400).json({
      error: "Invalid filterType. Use day, yesterday, week, month, or year.",
    });
  }

  const now = dayjs();
  let start, end;

  if (startDate && endDate) {
    start = dayjs(startDate).startOf("day").toDate();
    end = dayjs(endDate).endOf("day").toDate();
    filterType = getDateDifferenceType(startDate, endDate);
  } else
    switch (filterType) {
      case "day":
        start = now.startOf("day").toDate();
        end = now.endOf("day").toDate();
        break;
      case "yesterday":
        start = now.subtract(1, "day").startOf("day").toDate();
        end = now.subtract(1, "day").endOf("day").toDate();
        break;
      case "week":
        start = now.startOf("week").toDate();
        end = now.endOf("week").toDate();
        break;
      case "month":
        start = now.startOf("month").toDate();
        end = now.endOf("month").toDate();
        break;
      case "year":
        start = now.startOf("year").toDate();
        end = now.endOf("year").toDate();
        break;
    }

  try {
    const totalProviders = await prisma.provider.count();
    const totalSellers = await prisma.seller.count({
      where: {
        providerId: parseInt(providerId, 10) || undefined,
      },
    });

    // Fetch providers with sellers and payments count
    const providers = await prisma.provider.findMany({
      where: {
        id: parseInt(providerId, 10) || undefined,
      },
      select: {
        id: true,
        name: true,
        address: true,
        _count: {
          select: { sellers: true },
        },
      },
    });

    // Fetch payments within the selected date range and calculate totals manually
    const payments = await prisma.payment.findMany({
      where: {
        createtAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        providerId: true,
        price: true,
        companyPrice: true,
        qty: true,
      },
    });

    // Convert aggregation results into a map for quick lookup
    const paymentsMap = payments.reduce((acc, payment) => {
      const providerId = payment.providerId;

      if (!acc[providerId]) {
        acc[providerId] = { totalCompanyPrice: 0, totalPrice: 0, totalQty: 0 };
      }

      acc[providerId].totalCompanyPrice +=
        (payment.companyPrice || 0) * (payment.qty || 1); // ✅ Sum (companyPrice * qty)
      acc[providerId].totalPrice += (payment.price || 0) * (payment.qty || 1); // ✅ Sum (price * qty)
      acc[providerId].totalQty += payment.qty || 0; // ✅ Sum of quantities

      return acc;
    }, {});

    // Merge provider data with aggregated payment data
    const formattedProviders = providers.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      paymentsCount:
        payments?.filter((el) => el?.providerId === p?.id)?.length || 0,
      sellersCount: p._count.sellers,
      stockCount: p._count.sellers,
      totalCompanyPrice: paymentsMap[p.id]?.totalCompanyPrice || 0,
      totalPrice: paymentsMap[p.id]?.totalPrice || 0,
      totalQty: paymentsMap[p.id]?.totalQty || 0,
    }));

    const sortedList = formattedProviders?.sort(
      (a, b) => b.totalCompanyPrice - a.totalCompanyPrice
    );

    const totalPayments = formattedProviders
      ?.map((el) => el.totalCompanyPrice)
      .reduce((a, b) => a + b, 0);

    res.status(200).json({
      totalProviders,
      totalSellers,
      totalPayments,
      providers: sortedList,
    });
  } catch (error) {
    console.error("Error fetching providers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/report/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const providerId = parseInt(id);
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if(userType !== 'ADMIN' || 
    (!permissions.includes("superadmin") && 
    !permissions.includes("read_provider_report"))
  ) {
    return res.status(400).json({ error: "No permission to read provider report" });
  }

  try {
    const providerWallet = await prisma.providerWallet.findMany({
      where: {
        providerId,
      },
      select: {
        id: true,
        amount: true,
        date: true,
      },
    });

    const sellerWallet = await prisma.wallet.findMany({
      where: {
        providerId,
      },
      select: {
        id: true,
        amount: true,
        type: true,
        date: true,
        seller: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const initProviderWallet = providerWallet
      ?.map((el) => el?.amount)
      ?.reduce((a, b) => a + b, 0);

    const initSellerWallet = sellerWallet
      ?.map((el) => el?.amount)
      ?.reduce((a, b) => a + b, 0);

    let results = {
      sellerWallet: sellerWallet?.map((el) => ({
        id: el?.id,
        amount: el?.amount,
        date: el?.date,
        type: el?.type,
        sellerName: el?.seller?.name,
        sellerPhone: el?.seller?.phone,
      })),
      providerWallet,
      initProviderWallet,
      initSellerWallet,
    };

    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
