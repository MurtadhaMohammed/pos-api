const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.resetHoldExpired = async () => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  try {
    await prisma.stock.updateMany({
      where: {
        status: "Hold",
        hold_at: {
          lte: thirtyMinutesAgo,
        },
      },
      data: {
        status: "Ready",
        hold_id: null,
        hold_at: null,
      },
    });
    console.log("Expired hold cards reset to Ready.");
  } catch (error) {
    console.error("Error resetting expired cards:", error);
  }
};
