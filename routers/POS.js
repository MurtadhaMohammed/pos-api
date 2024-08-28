const express = require("express");
const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sellerAuth = require("../middleware/sellerAuth");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const router = express.Router();
const FormData = require("form-data");
const dayjs = require("dayjs");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Login seller
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const seller = await prisma.seller.findUnique({
    where: { username },
  });

  if (!seller) {
    return res.status(404).json({ error: "User not found" });
  }

  const valid = await bcrypt.compare(password, seller.password);

  if (!valid) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign(seller, JWT_SECRET);
  res.json({ token, ...seller });
});

// Login seller
router.get("/user", sellerAuth, async (req, res) => {
  let seller = await prisma.seller.findUnique({
    where: {
      id: parseInt(req?.user?.id),
    },
  });
  seller = {
    walletAmount: seller?.walletAmount,
    paymentAmount: seller?.paymentAmount,
  };
  res.json(seller);
});

// Read Cards
router.get("/cards", sellerAuth, async (req, res) => {
  try {
    const cards = await prisma.card.findMany({
      where: {
        providerId: Number(req?.user?.providerId),
      },
      include: {
        cardType: true,
      },
    });
    let data = cards?.map((el) => ({
      id: el?.id,
      price: el?.price,
      image: el?.cardType?.image,
      name: el?.cardType?.name,
      companyCardID: el?.cardType?.companyCardID,
    }));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/history", sellerAuth, async (req, res) => {
  try {
    // Get page and limit from query parameters, with default values
    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = parseInt(req.query.limit) || 10; // default to 10 items per page

    // Calculate the number of records to skip
    const skip = (page - 1) * limit;

    // Fetch paginated payments for the seller
    const payments = await prisma.payment.findMany({
      where: {
        sellerId: Number(req?.user?.id),
      },
      skip: skip,
      take: limit,
      orderBy: {
        createtAt: "desc",
      },
    });

    // Map and format the response
    let data = payments?.map((el) => ({
      id: el?.id,
      price: el?.price,
      image: el?.item?.details?.cover,
      providerId: el?.providerId,
      companyCardID: el?.companyCardID,
      createdAt: el?.createtAt,
      code: el?.item?.code,
      name: el?.item?.details?.title,
    }));

    // Get total count of payments for the seller
    const totalPayments = await prisma.payment.count({
      where: {
        sellerId: Number(req?.user?.id),
      },
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalPayments / limit);

    // Respond with paginated data and meta information
    res.json({
      currentPage: page,
      totalPages: totalPages,
      totalItems: totalPayments,
      limit: limit,
      records: data,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/cardHolder", sellerAuth, async (req, res) => {
  const { companyCardTypeId } = req.body;
  if (!companyCardTypeId) {
    return res.status(400).json({ message: "companyCardTypeId is required" });
  }

  try {
    const card = await prisma.card.findFirst({
      include: {
        cardType: true,
      },
      where: {
        cardType: {
          companyCardID: parseInt(companyCardTypeId),
        },
      },
    });

    const seller = await prisma.seller.findUnique({
      where: {
        id: parseInt(req?.user?.id),
      },
    });

    if (seller.walletAmount < card.price) {
      return res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    // Make a request to the external API
    const formdata = new FormData();
    formdata.append("companyCardTypeId", companyCardTypeId);

    const response = await fetch(
      "https://api.nojoomalrabiaa.com/v1/companyDashboard/cardHolder",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formdata,
      }
    );

    let data = await response.json();
    if (response.status === 200) {
      data = { ...data[0], walletAmount: seller.walletAmount };
    }
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      walletAmount: 0,
      error: error.message,
    });
  }
});

router.post("/purchase", sellerAuth, async (req, res) => {
  const { hold_id, sellerId, providerCardID, providerId } = req.body;
  if (!hold_id) {
    return res.status(400).json({ message: "hold_id is required" });
  }

  try {
    const card = await prisma.card.findUnique({
      where: {
        id: Number(providerCardID),
      },
    });

    const seller = await prisma.seller.findUnique({
      where: {
        id: Number(req?.user?.id),
      },
    });

    if (seller.walletAmount < card.price) {
      res.status(500).json({
        walletAmount: seller.walletAmount,
        error: "Your wallet is not enough!",
      });
    }

    // Make a request to the external API
    const formdata = new FormData();
    formdata.append("hold_id", hold_id);

    const response = await fetch(
      "https://api.nojoomalrabiaa.com/v1/companyDashboard/purchase",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
        },
        body: formdata,
      }
    );

    let data = await response.json();
    if (response.status === 200) {
      data = data[0];
    }

    if (!data.error) {
      const card = await prisma.card.findUnique({
        where: {
          id: parseInt(providerCardID),
        },
      });

      await prisma.payment.create({
        data: {
          provider: {
            connect: { id: parseInt(providerId) },
          },
          seller: {
            connect: { id: parseInt(sellerId) },
          },
          companyCardID: data?.id,
          price: card?.price,
          qty: 1,
          providerCardID: parseInt(providerCardID),
          item: data,
        },
      });

      await prisma.seller.update({
        where: {
          id: parseInt(sellerId),
        },
        data: {
          walletAmount: seller.walletAmount - card?.price,
          paymentAmount: seller.paymentAmount + card?.price,
        },
      });
    }

    // Send back the response from the external API
    res.status(response.status).json(data);
  } catch (error) {
    // Handle errors appropriately
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      error: error.message,
    });
  }
});

router.post("/active", sellerAuth, async (req, res) => {
  const { paymentId, macAddress, activeCode } = req.body;
  const { sellerId, isHajji, name, username } = req?.user;
  if (!macAddress || !activeCode) {
    return res
      .status(400)
      .json({ message: "macAddress and activeCode are required" });
  }

  if (!isHajji && !paymentId) {
    return res.status(400).json({ message: "paymentId is required" });
  }

  try {
    const response = await fetch(
      "https://dvbt-api-8-x.admin-panel.co/api/support/v6/starLine/active-code/device/add-account",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ACTIVE_TOKEN}`,
        },
        body: JSON.stringify({
          activeCode,
          macAddress,
        }),
      }
    );

    let data = await response.json();

    if (response.status === 200 && !isHajji) {
      await prisma.payment.update({
        where: {
          id: parseInt(paymentId),
        },
        data: {
          activeBy: {
            sellerId,
            name,
            username,
          },
        },
      });
    }

    // Send back the response from the external API
    res.status(response.status).json(data);
  } catch (error) {
    // Handle errors appropriately
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      error: error.message,
    });
  }
});

router.post("/refresh", sellerAuth, async (req, res) => {
  const { macAddress } = req.body;
  if (!macAddress) {
    return res.status(400).json({ message: "macAddress is required" });
  }

  try {
    const response = await fetch(
      `https://dvbt-api-8-x.admin-panel.co/api/support/v6/starLine/account/refresh/${macAddress}`,
      {
        method: "GET",
        headers: {
          // "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ACTIVE_TOKEN}`,
        },
      }
    );

    let data = await response.json();

    // Send back the response from the external API
    res.status(response.status).json(data);
  } catch (error) {
    // Handle errors appropriately
    console.error("Error making request to external API:", error.message);
    res.status(500).json({
      message: "Error making request to external API",
      error: error.message,
    });
  }
});

// app.post("/v1/purchase", upload.none(), async (req, res) => {
//   const { hold_id } = req.body;
//   if (!hold_id) {
//     return res.status(400).json({ message: "companyCardTypeId is required" });
//   }

//   try {
//     // Make a request to the external API
//     const response = await fetch(
//       "https://api.nojoomalrabiaa.com/v1/companyDashboard/purchase",
//       {
//         method: "POST",
//         headers: {
//           Token: process.env.COMPANY_TOKEN,
//         },
//         body: new URLSearchParams({ hold_id }),
//       }
//     );

//     if (!response.ok) {
//       throw new Error(`Error: ${response.statusText}`);
//     }

//     const data = await response.json();

//     // Send back the response from the external API
//     res.status(response.status).json(data);
//   } catch (error) {
//     // Handle errors appropriately
//     console.error("Error making request to external API:", error.message);
//     res.status(500).json({
//       message: "Error making request to external API",
//       error: error.message,
//     });
//   }
// });

module.exports = router;
