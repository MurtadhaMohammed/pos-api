const prisma = require(".././prismaClient");

exports.resetSellerExpiredHolds = async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
    try {
      await prisma.seller.updateMany({
        where: {
          holdId: { not: null },
          holdAt: {
            lte: thirtyMinutesAgo,
          },
        },
        data: {
          holdId: null,
          holdAt: null,
        },
      });
      console.log("Expired seller holds reset.");
    } catch (error) {
      console.error("Error resetting expired seller holds:", error);
    }
  };