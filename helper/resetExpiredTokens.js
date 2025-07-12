const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.resetBlacklist = async () => {
  try {
    await prisma.blocklist.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    console.log("Expired tokens deleted");
  } catch (error) {
    console.error("Error deleted tokens:", error);
  }
};
