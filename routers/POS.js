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
const { holdCard } = require("../helper/holdCard");
const { purchase } = require("../helper/purchase");
const getDateDifferenceType = require("../helper/getDateDifferenceType");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Read all Wallets
router.get("/wallets", sellerAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = parseInt(req.query.limit) || 10; // default to 10 items per page
    const skip = (page - 1) * limit;

    const total = await prisma.wallet.count({
      where: {
        sellerId: parseInt(req?.user?.id),
      },
    });
    const wallets = await prisma.wallet.findMany({
      where: {
        sellerId: parseInt(req?.user?.id),
      },
      take: limit,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });

    const totalPages = Math.ceil(total / limit);

    res.json({
      currentPage: page,
      totalPages: totalPages,
      totalItems: total,
      limit: limit,
      records: wallets,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
  res.json({ token, ...seller, password: "You can't see it 😉" });
});

// Login seller
router.post("/v2/login", async (req, res) => {
  const { username, password, device } = req.body;

  const seller = await prisma.seller.findUnique({
    where: { username, active: true },
  });

  if (!seller) {
    return res.status(404).json({ error: "User not found" });
  }

  if (seller.device && device !== seller.device) {
    return res.status(404).json({ error: "Device is already logied.!" });
  }

  if (!seller.device) {
    await prisma.seller.update({
      where: { id: seller?.id },
      data: { device },
    });
  }

  const valid = await bcrypt.compare(password, seller.password);

  if (!valid) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = jwt.sign(seller, JWT_SECRET);
  res.json({ token, ...seller, password: "You can't see it 😉" });
});

// Logout seller
router.post("/logout", sellerAuth, async (req, res) => {
  const { device } = req.body;
  const sellerId = parseInt(req.user.id, 0);

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
  });

  if (!seller) {
    return res.status(404).json({ error: "User not found" });
  }

  if (seller.device && device !== seller.device) {
    return res.status(404).json({ error: "You cant do this." });
  }

  res.status(200).json({ message: "Logout Succefulley.!" });
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

router.get("/v2/check-seller-active", sellerAuth, async (req, res) => {
  const device = req.query.deviceId;
  let seller = await prisma.seller.findUnique({
    where: {
      id: parseInt(req?.user?.id),
      device,
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
// router.get("/cards", sellerAuth, async (req, res) => {
//   try {
//     const seller = await prisma.seller.findUnique({
//       where: {
//         id: parseInt(req.user.id),
//       },
//     });

//     const hasAgent = !!seller?.agentId;
//     const cards = await prisma[hasAgent ? "agentCard" : "card"].findMany({
//       where: {
//         providerId: Number(req?.user?.providerId),
//         cardType: {
//           active: true,
//         },
//       },
//       include: {
//         cardType: true,
//       },
//     });

//     let data = cards?.map((el) => ({
//       id: el?.id,
//       price: el?.price,
//       companyPrice: el?.sellerPrice,
//       image: el?.cardType?.image,
//       name: el?.cardType?.name,
//       companyCardID: el?.cardType?.companyCardID,
//       source: hasAgent ? "Agent" : "Provider",
//     }));
//     res.json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

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
    let data = payments?.map((el) => {
      let item = Array.isArray(el?.item) ? el?.item[0] : el?.item;
      let code = Array.isArray(el?.item)
        ? el?.item.map((d) => d.code).join(" ,")
        : el?.item?.code;
      return {
        id: el?.id,
        price: el?.price,
        qty: el?.qty,
        companyPrice: el?.companyPrice || el?.price || 0,
        image: item?.details?.cover,
        providerId: el?.providerId,
        companyCardID: el?.companyCardID,
        createdAt: el?.createtAt,
        code,
        note: el?.note,
        name: item?.details?.title,
        activeState: el.activeBy?.sellerId ? "active" : "pending",
      };
    });

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

// router.post("/cardHolder", sellerAuth, async (req, res) => {
//   const { companyCardTypeId, quantity = 1 } = req.body;
//   if (!companyCardTypeId) {
//     return res.status(400).json({ message: "companyCardTypeId is required" });
//   }

//   if (quantity > 1) {
//     return res.status(500).json({
//       error: "لاتستطيع شراء اكثر من بطاقة بالوقت الحالي!.",
//     });
//   }

//   try {
//     const seller = await prisma.seller.findUnique({
//       where: {
//         id: parseInt(req?.user?.id),
//       },
//     });

//     if (!seller.active) {
//       return res.status(500).json({
//         error: "This account is not active!",
//       });
//     }

//     const hasAgent = !!seller?.agentId;

//     const card = await prisma[hasAgent ? "agentCard" : "card"].findFirst({
//       include: {
//         cardType: true,
//       },
//       where: {
//         providerId: seller?.providerId,
//         cardType: {
//           companyCardID: parseInt(companyCardTypeId),
//         },
//         ...(hasAgent ? { agentId: seller?.agentId } : {}),
//       },
//     });

//     if (!card) {
//       return res.status(500).json({
//         error: "No card found!",
//       });
//     }

//     const cardPrice = card?.price;
//     const companyPrice = card?.sellerPrice;

//     if (seller.walletAmount < (companyPrice * quantity || 1)) {
//       return res.status(500).json({
//         walletAmount: seller.walletAmount,
//         error: "Your wallet is not enough!",
//       });
//     }

//     // Make a request to the external API
//     const formdata = new FormData();
//     formdata.append("companyCardTypeId", companyCardTypeId);
//     formdata.append("quantity", quantity);

//     const response = await fetch(
//       "https://client.nojoomalrabiaa.com/api/client/hold-card",
//       // "https://api.nojoomalrabiaa.com/v1/companyDashboard/cardHolder",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
//         },
//         body: formdata,
//       }
//     );
//     let data = await response.json();
//     if (response.status === 200) {
//       data = {
//         ...data[0],
//         walletAmount: seller.walletAmount,
//         price: cardPrice,
//         companyPrice,
//       };
//     }
//     res.status(response.status).json(data);
//   } catch (error) {
//     console.log(error);
//     console.error("Error making request to external API:", error.message);
//     res.status(500).json({
//       message: "Error making request to external API",
//       walletAmount: 0,
//       error: error.message,
//     });
//   }
// });

router.get("/cards", sellerAuth, async (req, res) => {
  try {
    const cards = await prisma.customPrice.findMany({
      where: {
        providerId: Number(req?.user?.providerId),
        plan: {
          active: true,
        },
      },
      include: {
        plan: true,
      },
    });

    let data = cards?.map((el) => ({
      id: el?.id,
      price: el?.price,
      companyPrice: el?.sellerPrice,
      image: el?.plan?.image,
      name: el?.plan?.title,
      companyCardID: el?.id,
    }));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/cards/:categoryId", sellerAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId, 10) || undefined;

    const cards = await prisma.customPrice.findMany({
      where: {
        providerId: Number(req?.user?.providerId),
        plan: {
          categoryId,
          active: true,
        },
      },
      include: {
        plan: true,
      },
    });

    let data = cards?.map((el) => ({
      id: el?.id,
      price: el?.price,
      companyPrice: el?.sellerPrice,
      image: el?.plan?.image,
      name: el?.plan?.title,
      companyCardID: el?.id,
    }));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/cardHolder", sellerAuth, async (req, res) => {
  const { companyCardTypeId, quantity = 1 } = req.body;
  const sellerId = parseInt(req?.user?.id);
  try {
    let resp = await holdCard(companyCardTypeId, quantity, sellerId);
    if (resp.error) {
      return res.status(500).json(resp);
    }
    res.status(200).json(resp);
  } catch (error) {
    res.status(500).json({
      walletAmount: 0,
      error: error.message,
    });
  }
});

router.post("/v2/purchase", sellerAuth, async (req, res) => {
  const { hold_id, note } = req.body;
  const sellerId = parseInt(req?.user?.id);

  try {
    let resp = await purchase(hold_id, sellerId, note);
    if (resp.error) {
      return res.status(500).json(resp);
    }
    res.status(200).json(resp);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// router.post("/purchase", sellerAuth, async (req, res) => {
//   const { hold_id, sellerId, providerCardID, providerId } = req.body;
//   if (!hold_id) {
//     return res.status(400).json({ message: "hold_id is required" });
//   }

//   try {
//     const seller = await prisma.seller.findUnique({
//       where: {
//         id: Number(req?.user?.id),
//       },
//     });
//     const hasAgent = !!seller?.agentId;
//     const card = await prisma[hasAgent ? "agentCard" : "card"].findUnique({
//       where: {
//         id: Number(providerCardID), // also agent card id if has agent
//       },
//     });

//     const cardPrice = card?.price;
//     const companyPrice = card?.sellerPrice;

//     if (seller?.walletAmount < companyPrice) {
//       res.status(500).json({
//         walletAmount: seller.walletAmount,
//         error: "Your wallet is not enough!",
//       });
//     }

//     // Make a request to the external API
//     const formdata = new FormData();
//     formdata.append("hold_id", hold_id);

//     const response = await fetch(
//       "https://client.nojoomalrabiaa.com/api/client/purchase",
//       // "https://api.nojoomalrabiaa.com/v1/companyDashboard/purchase",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
//         },
//         body: formdata,
//       }
//     );

//     let data = await response.json();
//     // if (response.status === 200) {
//     //   data = data[0];
//     // }

//     let payment;
//     if (response.status === 200 && !data[0].error) {
//       // const card = await prisma.card.findUnique({
//       //   where: {
//       //     id: parseInt(providerCardID),
//       //   },
//       // });

//       payment = await prisma.payment.create({
//         data: {
//           provider: {
//             connect: { id: parseInt(providerId) },
//           },
//           seller: {
//             connect: { id: parseInt(sellerId) },
//           },
//           companyCardID: data[0]?.id,
//           price: cardPrice,
//           companyPrice,
//           localCard: card,
//           qty: data?.length,
//           providerCardID: parseInt(providerCardID),
//           item: data,
//         },
//       });

//       await prisma.seller.update({
//         where: {
//           id: parseInt(sellerId),
//         },
//         data: {
//           walletAmount: seller.walletAmount - companyPrice * data?.length,
//           paymentAmount: seller.paymentAmount + companyPrice * data?.length,
//         },
//       });
//     }

//     // Send back the response from the external API
//     res.status(response.status).json({ ...data[0], paymentId: payment?.id });
//   } catch (error) {
//     // Handle errors appropriately
//     console.error("Error making request to external API:", error.message);
//     res.status(500).json({
//       message: "Error making request to external API",
//       error: error.message,
//     });
//   }
// });

// router.post("/v2/purchase", sellerAuth, async (req, res) => {
//   const { hold_id, providerCardID, providerId } = req.body;

//   const sellerId = req?.user?.id;

//   if (!hold_id) {
//     return res.status(400).json({ message: "hold_id is required" });
//   }

//   try {
//     const seller = await prisma.seller.findUnique({
//       where: {
//         id: Number(sellerId),
//       },
//     });

//     const hasAgent = !!seller?.agentId;
//     const card = await prisma[hasAgent ? "agentCard" : "card"].findUnique({
//       where: {
//         id: Number(providerCardID), // also agent card id if has agent
//         providerId,
//         ...(hasAgent ? { agentId: seller?.agentId } : {}),
//       },
//       ...(hasAgent
//         ? {
//             include: {
//               card: true,
//             },
//           }
//         : {}),
//     });

//     if (!card) {
//       return res.status(404).json({ error: "Card Not Found!." });
//     }

//     const cardPrice = card?.price;
//     const companyPrice = card?.sellerPrice;

//     // if (seller?.walletAmount < (cardPrice * qty)) {
//     //   res.status(500).json({
//     //     walletAmount: seller.walletAmount,
//     //     error: "Your wallet is not enough!",
//     //   });
//     // }

//     // Make a request to the external API
//     const formdata = new FormData();
//     formdata.append("hold_id", hold_id);

//     const response = await fetch(
//       "https://client.nojoomalrabiaa.com/api/client/purchase",
//       // "https://api.nojoomalrabiaa.com/v1/companyDashboard/purchase",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${process.env.COMPANY_TOKEN}`,
//         },
//         body: formdata,
//       }
//     );

//     let data = await response.json();
//     // if (response.status === 200) {
//     //   data = data[0];
//     // }

//     let payment;
//     if (response.status === 200 && !data[0].error) {
//       payment = await prisma.payment.create({
//         data: {
//           provider: {
//             connect: { id: parseInt(providerId) },
//           },
//           seller: {
//             connect: { id: parseInt(sellerId) },
//           },
//           agent: seller?.agentId
//             ? {
//                 connect: { id: seller.agentId }, // Use the relationship here
//               }
//             : undefined, // Leave undefined if no agent
//           companyCardID: data[0]?.id,
//           price: cardPrice,
//           companyPrice,
//           localCard: card,
//           qty: data?.length,
//           providerCardID: parseInt(providerCardID),
//           item: data,
//         },
//       });

//       const updatedSeller = await prisma.seller.update({
//         where: {
//           id: parseInt(sellerId),
//         },
//         data: {
//           walletAmount: {
//             decrement: companyPrice * data?.length,
//           },
//           paymentAmount: {
//             increment: companyPrice * data?.length,
//           },
//         },
//       });

//       // Map and format the response

//       // "id": jsonResponse["id"],
//       // "paymentId": jsonResponse["paymentId"],
//       // "code": jsonResponse["code"],
//       // "createdAt": jsonResponse["createdAt"],

//       let item = Array.isArray(payment?.item)
//         ? payment?.item[0]
//         : payment?.item;
//       let code = Array.isArray(payment?.item)
//         ? payment?.item.map((d) => d.code).join(" ,")
//         : payment?.item?.code;

//       resp = {
//         id: item?.id,
//         paymentId: payment?.id,
//         price: payment?.price,
//         qty: payment?.qty,
//         createdAt: payment?.createtAt,
//         walletAmount: updatedSeller?.walletAmount,
//         code,
//         name: item?.details?.title,
//         // activeState: payment.activeBy?.sellerId ? "active" : "pending",
//       };

//       res.status(200).json(resp);
//     } else {
//       res.status(response.status).json(data[0]);
//     }

//     // Send back the response from the external API
//   } catch (error) {
//     // Handle errors appropriately
//     console.error("Error making request to external API:", error.message);
//     res.status(500).json({
//       message: "Error making request to external API",
//       error: error.message,
//     });
//   }
// });

router.post("/active", sellerAuth, async (req, res) => {
  const { paymentId, macAddress, activeCode } = req.body;
  const { id, isHajji, name, username } = req?.user;
  const sellerId = parseInt(id, 10)
  console.log({sellerId, isHajji, name, username, paymentId })
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
      // "https://support.starlineiq.com/api/support/v7/starLine/active-code/device/add-account",
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
      // `https://dvbt-api-8-x.admin-panel.co/api/support/v6/starLine/account/refresh/${macAddress}`,
      `https://support.starlineiq.com/api/support/v7/starLine/active-code/device/refresh/${macAddress}`,
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

router.get("/invoice/:id", sellerAuth, async (req, res) => {
  let id = req.params.id || 0;
  const sellerId = req.user.id;
  const width = 384;
  const padding = 0;

  try {
    const payment = await prisma.payment.findUnique({
      where: {
        id: parseInt(id),
        sellerId: parseInt(sellerId),
      },
      include: {
        seller: true,
      },
    });

    if (!payment) {
      return res.status(401).json({ message: "لاتصير لوتي!" });
    }

    let items = Array.isArray(payment?.item) ? payment?.item : [payment?.item];

    const logoPath = "assets/logo2.png"; // Path to logo image
    const companyName = payment?.seller?.name;
    const invoiceNumber = `#${payment?.id}`;
    const cardName = items[0]?.details?.title;
    const codes = items?.map((item) => item?.code);
    const price = payment?.price * payment?.qty;
    const date = dayjs(payment?.createtAt).format("YYYY-MM-DD hh:mm A");
    const phone = "07855551040, 07755551040";

    const codeStartY = 374; // Starting Y position for the codes
    const codeLineHeight = 60; // Vertical spacing between each code

    const textSvg = Buffer.from(`
       <svg width="${width}" height="${
      codeStartY + codes.length * codeLineHeight + 280
    }" xmlns="http://www.w3.org/2000/svg">
        <style>
            @import url('https://fonts.cdnfonts.com/css/somar-sans');
    
            *{
              font-family: 'Somar Sans', sans-serif;
              font-size: 28px;
              font-weight: bold;
            }
    
            .code{
              font-size: ${codes[0].length > 15 ? "42px" : "46px"};
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
        <text x="50%" y="200" class="compnay" text-anchor="middle">${invoiceNumber} :رقم الفاتورة</text>
        <text x="50%" y="240" class="compnay" text-anchor="middle">${companyName}</text>
        <line x1="4" y1="280" x2="380" y2="280" stroke="black" stroke-width="1" />
        <text x="50%" y="320" class="compnay" text-anchor="middle">${cardName}</text>
    
        ${codes
          ?.map((code, i) => {
            const currentY = codeStartY + i * codeLineHeight; // Calculate Y position dynamically
            return `<text x="50%" y="${currentY}" class="code" text-anchor="middle">${code}</text>`;
          })
          .join("")}
    
        <text x="50%" y="${
          codeStartY + codes.length * codeLineHeight + 10
        }" class="price" text-anchor="middle">السعر: ${Number(
      price
    ).toLocaleString("en")} د.ع</text>
        <line x1="4" y1="${
          codeStartY + codes.length * codeLineHeight + 40
        }" x2="380" y2="${
      codeStartY + codes.length * codeLineHeight + 40
    }" stroke="black" stroke-width="1" />
        <text x="50%" y="${
          codeStartY + codes.length * codeLineHeight + 80
        }" class="compnay" text-anchor="middle">${date}</text>
        
        <rect x="10" y="${
          codeStartY + codes.length * codeLineHeight + 120
        }" width="360" height="140" stroke="black" fill="none" stroke-width="2"/>
        <text x="50%" y="${
          codeStartY + codes.length * codeLineHeight + 160
        }" class="compnay" text-anchor="middle">اذا كانت لديك اي مشكلة</text>
        <text x="50%" y="${
          codeStartY + codes.length * codeLineHeight + 195
        }" class="msg" text-anchor="middle">تواصل معنا عبر الارقام التالية</text>
        <text x="50%" y="${
          codeStartY + codes.length * codeLineHeight + 230
        }" class="msg" text-anchor="middle">${phone}</text>
      </svg>
    `);

    const totalWidth = width + 2 * padding;
    const totalHeight =
      codeStartY + codes.length * codeLineHeight + 280 + padding + padding;

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
                fs.unlinkSync(`invoices/${payment?.sellerId}-invoice.png`);
                console.error("Error reading file:", err);
                res.status(500).json({ message: "Error reading file" });
              } else {
                const base64Image = data.toString("base64");
                fs.unlinkSync(`invoices/${payment?.sellerId}-invoice.png`);
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

// Read all category
router.get("/categories", sellerAuth, async (req, res) => {
  try {
    const take = parseInt(req.query.take || 20);
    const skip = parseInt(req.query.skip || 0);

    const cards = await prisma.customPrice.findMany({
      where: {
        providerId: Number(req?.user?.providerId),
        plan: {
          active: true,
        },
      },
      include: {
        plan: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    // const categoryIds = [...new Set(cards.map((card) => card.plan.categoryId))];
    const categoryIds = [
      ...new Set(cards.map((card) => card.plan?.categoryId).filter(Boolean)),
    ];

    const where = {
      active: true,
      id: {
        in: categoryIds,
      },
    };

    const categories = await prisma.category.findMany({
      where,
      take,
      skip,
      orderBy: {
        priority: "asc",
      },
    });

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

router.get("/report/plans", sellerAuth, async (req, res) => {
  try {
    let { filterType, startDate, endDate } = req.query;
    const sellerId = parseInt(req.user.id, 10);

    // Validate filterType
    if (
      !startDate &&
      !["day", "week", "month", "year", "yesterday"].includes(filterType)
    ) {
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

    const stockSummary = await prisma.stock.groupBy({
      by: ["planId"],
      where: {
        sold_at: { gte: start, lte: end },
        status: "Sold",
        sellerId: sellerId || undefined,
      },
      _count: {
        id: true,
      },
      _min: {
        planId: true,
      },
    });

    // Fetch plan titles separately and map them to the results
    const planIds = stockSummary.map((item) => item.planId);
    const plans = await prisma.plan.findMany({
      where: { id: { in: planIds } },
      select: { id: true, title: true },
    });

    // Merge titles with grouped results
    const result = stockSummary.map((item) => ({
      planId: item.planId,
      title: plans.find((plan) => plan.id === item.planId)?.title || "Unknown",
      count: item._count.id,
    }));

    res.json(result);
  } catch (error) {
    console.error("Error fetching payments by interval:", error);
    res.status(500).json({ error: "An error occurred." });
  }
});

router.get("/report/total", sellerAuth, async (req, res) => {
  try {
    let { filterType, startDate, endDate } = req.query;

    // console.log("startDate : ", startDate)
    // console.log("endDate : ", endDate)
    // console.log("filterType : ", filterType)

    // Validate filterType
    if (
      !startDate &&
      !["day", "week", "month", "year", "yesterday"].includes(filterType)
    ) {
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

    const payments = await prisma.payment.findMany({
      where: {
        createtAt: { gte: start, lte: end },
        sellerId: parseInt(req.user.id, 10) || undefined,
      },
      select: { createtAt: true, price: true, companyPrice: true, qty: true },
    });

    const total = payments.reduce(
      (sum, curr) => sum + (curr.companyPrice || 0) * (curr.qty || 1),
      0
    );
    res.status(200).json({
      total,
    });
  } catch (error) {
    console.error("Error fetching payments by interval:", error);
    res.status(500).json({ error: "An error occurred." });
  }
});

module.exports = router;
