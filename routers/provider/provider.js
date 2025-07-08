const express = require("express");
const prisma = require("../../prismaClient");
const providerAuth = require("./middleware/providerAuth");
const router = express.Router();

router.get("/about/:id", providerAuth, async (req, res) => {
  const providerId = req.params.id;
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (userType !== 'PROVIDER' || (!permissions.includes("superprovider") && !permissions.includes("provider_read_about"))) {
    return res.status(400).json({ error: "No permission to read provider about" });
  }
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: parseInt(providerId) },
    });
    res.json(provider);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/summary/:id", providerAuth, async (req, res) => {
    const providerId = req.params.id;
    const permissions = req.user.permissions || [];
    const userType = req.user.type;
  
    if (!providerId) {
      return res.status(400).json({ error: "Provider ID is required" });
    }
  
    try {
  
      if (
        userType !== 'PROVIDER' || 
        (
          !permissions.includes("superprovider") &&
          !permissions.includes("provider_read_about")
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

module.exports = router;