const express = require("express");
const prisma = require("../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const sellerAuth = require("../middleware/sellerAuth");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const router = express.Router();
const FormData = require("form-data");
const sharp = require("sharp");
const fs = require("fs");
const dayjs = require("dayjs");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Login seller
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const seller = await prisma.seller.findUnique({
    where: { username, active: true },
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

router.get("/check-seller-active", sellerAuth, async (req, res) => {
  let seller = await prisma.seller.findUnique({
    where: {
      id: parseInt(req?.user?.id),
      active: true,
    },
  });
  if (!seller) res.status(401).json({ success: false, error: "Invalid User!" });
  else res.json({ success: true });
});

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
      companyPrice: el?.companyPrice,
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
      companyPrice: el?.companyPrice || el?.price || 0,
      image: el?.item?.details?.cover,
      providerId: el?.providerId,
      companyCardID: el?.companyCardID,
      createdAt: el?.createtAt,
      code: el?.item?.code,
      name: el?.item?.details?.title,
      activeState: el.activeBy?.sellerId ? "active" : "pending",
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

    if (!seller.active) {
      return res.status(500).json({
        error: "This account is not active!",
      });
    }

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
      data = {
        ...data[0],
        walletAmount: seller.walletAmount,
        price: card?.price,
        companyPrice: card?.companyPrice,
      };
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

    if (seller?.walletAmount < card?.companyPrice) {
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

    let payment;
    if (!data.error) {
      const card = await prisma.card.findUnique({
        where: {
          id: parseInt(providerCardID),
        },
      });

      payment = await prisma.payment.create({
        data: {
          provider: {
            connect: { id: parseInt(providerId) },
          },
          seller: {
            connect: { id: parseInt(sellerId) },
          },
          companyCardID: data?.id,
          price: card?.price,
          companyPrice: card?.companyPrice,
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
          walletAmount: seller.walletAmount - card?.companyPrice,
          paymentAmount: seller.paymentAmount + card?.companyPrice,
        },
      });
    }

    // Send back the response from the external API
    res.status(response.status).json({ ...data, paymentId: payment?.id });
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

router.get("/invoice/:id", async (req, res) => {
  let id = req.params.id || 0;
  const width = 384;
  const height = 710;
  const padding = 0;

  try {
    const payment = await prisma.payment.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        seller: true,
      },
    });

    const logoPath = "assets/logo2.png"; // Path to logo image
    const companyName = payment?.seller?.name;
    const invoiceNumber = `#${payment?.id}`;
    const cardName = payment?.item?.details?.title;
    const cardCode = payment?.item?.code;
    const price = payment?.price;
    const date = dayjs(payment?.createtAt).format("YYYY-MM-DD hh:mm A");
    const phone = "07855551040, 07755551040";

    //const lines = msg.match(/.{1,29}/g); // Adjust 40 to your preferred line length
    // Create Arabic text as an SVG with matching width
    const textSvg = Buffer.from(`
       <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
            @import url('https://fonts.cdnfonts.com/css/somar-sans');

            *{
              font-family: 'Somar Sans', sans-serif;
              font-size: 28px;
              font-weight: bold;
            }

            .code{
              font-size: 46px;
              font-weight: bold;
            }
            .price{
              font-size: 34px;
              font-weight: bold;
              direction: rtl;
            }
            .msg{
          font-family: 'Somar Sans', sans-serif;
              font-size: 22px;
              font-weight: bold;
            }
        </style>
        <line x1="4" y1="150" x2="380" y2="150" stroke="black" stroke-width="1" />
        <text x="50%" y="200" class="compnay" text-anchor="middle">  ${invoiceNumber} :رقم الفاتورة</text>
        <text x="50%" y="240" class="compnay" text-anchor="middle">${companyName}</text>
        <line x1="4" y1="280" x2="380" y2="280" stroke="black" stroke-width="1" />
        <text x="50%" y="320" class="compnay" text-anchor="middle">${cardName}</text>
        <text x="50%" y="374" class="code" text-anchor="middle">${cardCode}</text>
        <text x="50%" y="430" class="price" text-anchor="middle">السعر: ${Number(
          price
        ).toLocaleString("en")} د.ع </text>
        <line x1="4" y1="460" x2="380" y2="460" stroke="black" stroke-width="1" />
        <text x="50%" y="500" class="compnay" text-anchor="middle">${date}</text>
        
        <rect x="10" y="540" width="360" height="140" stroke="black" fill="none" stroke-width="2"/>
        <text x="50%" y="580" class="compnay" text-anchor="middle">اذا كانت لديك اي مشكلة</text>
        <text x="50%" y="615" class="msg" text-anchor="middle">تواصل معنا عبر الارقام التالية</text>
        <text x="50%" y="650" class="msg" text-anchor="middle">${phone}</text>
      </svg>
    `);

    const totalWidth = width + 2 * padding;
    const totalHeight = height + padding + padding;

    sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
      },
    })
      .composite([
        {
          input: logoPath,
          top: 46,
          left: 76,
        },
        {
          input: textSvg,
          top: padding,
          left: padding,
        },
      ])
      .toFile(`invoices/${payment?.sellerId}-invoice.png`, (err, info) => {
        if (err) {
          console.error("Error saving file:", err);
          res.status(500).json({ message: "Error generating file" });
        } else {
          // Read file and convert to base64
          fs.readFile(
            `invoices/${payment?.sellerId}-invoice.png`,
            (err, data) => {
              if (err) {
                console.error("Error reading file:", err);
                res.status(500).json({ message: "Error reading file" });
              } else {
                const base64Image = data.toString("base64");
                res.status(200).json({ image: base64Image });
              }
            }
          );
        }
      });
  } catch (error) {
    res.status(500).json({ message: error?.message || "Error" });
  }
});
// .toFile("invoice.png", (err, info) => {
//   if (err) {
//     console.error(err);
//     res.status(500).send({ message: "ERROR" });
//   } else {
//     res.status(200).send({ message: "yes" });
//   }
// });

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
