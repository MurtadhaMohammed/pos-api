const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const router = express.Router();

router.get("/", providerAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.userType;

  try {
    if (
      userType !== 'PROVIDER' || 
      (
        !permissions.includes("superprovider") &&
        !permissions.includes("read_payment")
      )
    ){
      return res.status(400).json({ error: "No permission to read payments" });
    }
    
    const q = req.query.q || undefined;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;
    const { providerId } = req.user;

    const where = {
      providerId: parseInt(providerId)
    };

    if (startDate && endDate) {
      where.createtAt = {
        gte: startDate,
        lte: endDate,
      };
    }

    const skip = (page - 1) * limit;

    const totalPayments = await prisma.payment.count({
      where: {
        ...where,
        OR: q ? [
          {
            seller: {
              name: {
                contains: q,
              },
            },
          },
          {
            item: {
              array_contains: [{ code: q }],
            },
          },
        ] : undefined
      },
    });

    const payments = await prisma.payment.findMany({
      where: {
        ...where,
        OR: q ? [
          {
            seller: {
              name: {
                contains: q,
              },
            },
          },
          {
            item: {
              array_contains: [{ code: q }],
            },
          },
        ] : undefined
      },
      include: {
        seller: true,
        provider: true,
      },
      skip: skip,
      take: limit,
      orderBy: {
        createtAt: "desc",
      },
    });

    const totalPages = Math.ceil(totalPayments / limit);

    res.json({
      data: payments,
      totalItems: totalPayments,
      totalPages: totalPages,
      currentPage: page,
      pageSize: limit,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/refund/:paymentId", providerAuth, async (req, res) => {
    const { paymentId } = req.params;
    const providerId = req.user.providerId;
    const permissions = req.user.permissions;
    const userType = req.user.userType;
  
    try {
        if (
            userType !== 'PROVIDER' || 
            (
                !permissions.includes("superprovider") &&
                !permissions.includes("refund_payment")
            )
        ){
            return res.status(403).json({ error: "No permission to refund payment" });
        }
  
        const payment = await prisma.payment.findUnique({
            where: { 
                id: Number(paymentId),
                providerId: Number(providerId) 
            },
            include: {
                seller: true,
            },
        });
  
        if (!payment || !payment.seller) {
            return res.status(404).json({
                success: false,
                msg: "Payment not found or you don't have access to it",
            });
        }
  
        await prisma.$transaction([
            prisma.seller.update({
                where: {
                    id: payment.sellerId,
                },
                data: {
                    walletAmount: { increment: payment.companyPrice * payment.qty },
                },
            }),
  
            prisma.wallet.create({
                data: {
                    sellerId: payment.seller.id,
                    providerId: payment.seller.providerId,
                    amount: payment.companyPrice * payment.qty,
                    type: "REFUND",
                },
            }),
            prisma.payment.delete({
                where: {
                    id: Number(paymentId),
                },
            }),
  
            prisma.stock.updateMany({
                where: {
                    code: {
                        in: payment?.item?.map((p) => p.code),
                    },
                    providerId: Number(providerId) 
                },
                data: {
                    status: "Ready",
                },
            }),
        ]);
  
        res.json({ success: true, msg: "Refund processed successfully" });
    } catch (error) {
        console.error("Error processing refund:", error.message);
        res.status(500).json({
            success: false,
            msg: "Internal server error",
            error: error.message,
        });
    }
});