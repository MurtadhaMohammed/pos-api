const prisma = require("../prismaClient");
const { v4: uuidv4 } = require("uuid");

function generateCustomHoldId() {
  const uuid = uuidv4();
  return `${uuid.slice(0, 8)}-${uuid.slice(9, 13)}${uuid.slice(14, 18)}`;
}

exports.holdCard = async (cardId, quantity = 1, sellerId) => {
  if (!cardId) {
    return { error: "cardId is required" };
  }

  if (quantity > 1) {
    return {
      error: "لاتستطيع شراء اكثر من بطاقة بالوقت الحالي!.",
    };
  }

  const seller = await prisma.seller.findUnique({
    where: { id: sellerId },
    include: {
      provider: true,
    },
  });

  if (!seller || !seller.active) {
    return { error: "This account is not active!" };
  }

  if (!seller?.provider?.active) {
    return { error: "Provider is not active!." };
  }

  const card = await prisma.customPrice.findUnique({
    include: { plan: true },
    where: { id: cardId, providerId: seller.providerId },
  });

  if (!card) {
    return { error: "No card found!" };
  }

  if (seller.providerId !== card.providerId) {
    return { error: "لاتصير لوتي !." };
  }

  const cardPrice = card.price;
  const companyPrice = card.sellerPrice;

  if (!companyPrice || seller.walletAmount < companyPrice * quantity) {
    return {
      walletAmount: seller.walletAmount,
      error: "Your wallet is not enough!",
    };
  }

  const stock = await prisma.stock.findMany({
    where: {
      planId: card.planId,
      active: true,
      status: "Ready",
    },
    take: quantity,
  });

  if (stock.length < quantity) {
    return { error: "Not enough stock available!" };
  }

  let hold_id = generateCustomHoldId();
  const stockIds = stock.map((card) => card.id);

  await prisma.stock.updateMany({
    where: {
      id: { in: stockIds },
      active: true,
    },
    data: {
      status: "Hold",
      hold_id,
      hold_at: new Date(),
      providerId: seller.providerId,
      sellerId: seller.id,
    },
  });

  return {
    walletAmount: seller.walletAmount,
    price: cardPrice,
    companyPrice,
    quantity,
    hold_id,
  };
};
