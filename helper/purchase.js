const prisma = require("../prismaClient");

exports.purchase = async (hold_id, sellerId, note = "") => {
  if (!hold_id) {
    return { error: "hold_id is required" };
  }

  // Fetch seller with provider details
  const seller = await prisma.seller.findUnique({
    where: { id: Number(sellerId) },
    include: { provider: true },
  });

  if (!seller || !seller.active) {
    return { error: "Seller is not active!" };
  }

  if (!seller.provider || !seller.provider.active) {
    return { error: "Provider is not active!" };
  }

  // Fetch stock details
  const stock = await prisma.stock.findMany({
    where: {
      active: true,
      hold_id,
      providerId: seller.providerId,
      sellerId: seller.id,
    },
    include: {
      plan: true,
      archive: {
        select: {
          active: true,
        },
      },
    },
  });

  if (stock?.some((el) => !el?.archive?.active)) {
    return { error: "this archive not available anymore!" };
  }

  if (!stock.length) {
    return { error: "No stock found for this hold_id!" };
  }

  // Check if hold has expired
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  if (new Date(stock[0].hold_at) < thirtyMinutesAgo) {
    await prisma.stock.updateMany({
      where: { hold_id },
      data: {
        status: "Ready",
        hold_id: null,
        hold_at: null,
      },
    });
    return { error: "Hold expired! Card is now available again." };
  }

  const planId = stock[0]?.planId;
  if (!planId) {
    return { error: "Plan ID is missing for this stock!" };
  }

  // Fetch pricing details
  const customPrice = await prisma.customPrice.findFirst({
    where: {
      active: true,
      providerId: seller.providerId,
      planId,
    },
  });

  if (!customPrice) {
    return { error: "No custom price found for this plan!" };
  }

  const {
    price: cardPrice,
    sellerPrice: companyPrice,
    companyPrice: providerCost,
  } = customPrice;
  const totalCost = companyPrice * stock.length;

  if (!seller.walletAmount || seller.walletAmount < totalCost) {
    return {
      error: "Insufficient wallet balance!",
      walletAmount: seller.walletAmount,
    };
  }

  const stockIds = stock.map((s) => s.id);

  try {
    // Perform transaction
    const [_, payment, updatedSeller] = await prisma.$transaction([
      // Mark stock as sold
      prisma.stock.updateMany({
        where: { id: { in: stockIds } },
        data: {
          status: "Sold",
          hold_id: null,
          hold_at: null,
          providerId: seller.providerId,
          sellerId: seller.id,
          sold_at: new Date(),
        },
      }),

      // Create payment record
      prisma.payment.create({
        data: {
          providerId: seller.providerId,
          sellerId: seller.id,
          companyCardID: planId,
          price: cardPrice,
          companyPrice,
          localCard: {
            id: customPrice.id,
            price: cardPrice,
            providerId: seller.providerId,
            sellerPrice: companyPrice,
            companyPrice: providerCost,
          },
          qty: stock.length,
          providerCardID: customPrice.id,
          note,
          holdId: hold_id,
          item: stock.map((s) => ({
            id: customPrice.id,
            code: s.code,
            status: "Sold",
            details: {
              cover: s.plan?.image,
              price: cardPrice,
              title: s.plan?.title,
            },
          })),
        },
      }),

      // Deduct from seller's wallet and update payment amount
      prisma.seller.update({
        where: { id: Number(sellerId) },
        data: {
          walletAmount: { decrement: companyPrice * stock.length },
          paymentAmount: { increment: companyPrice * stock.length },
        },
      }),
    ]);

    const codes = stock.map((s) => s.code).join(", ");
    return {
      id: customPrice.id,
      paymentId: payment.id,
      price: payment.price,
      qty: payment.qty,
      createdAt: payment.createtAt,
      walletAmount: updatedSeller.walletAmount,
      code: codes,
      name: stock[0]?.plan?.title || "Unknown Plan",
      companyPrice,
      note: payment?.note,
    };
  } catch (error) {
    console.error("Transaction Failed:", error);
    return { error: "Transaction failed, please try again!" };
  }
};
