const express = require("express");
const router = express.Router();
const paymentRouter = require("./payment");
const sellerRouter = require("./seller");
const walletRouter = require("./wallet");
const providerRouter = require("./provider");
const cardRouter = require("./card");
const planRouter = require("./plan");
const stockRouter = require("./stock");
const providerCardsRouter = require("./providerCards");
const providerWalletRouter = require("./providerWallet");

router.use("/payments", paymentRouter);
router.use("/seller", sellerRouter);
router.use("/wallet", walletRouter);
router.use("/card", cardRouter);
router.use("/plan", planRouter);
router.use("/provider", providerRouter);
router.use("/provider-wallet", providerWalletRouter);
router.use("/stock", stockRouter);
router.use("/provider-cards", providerCardsRouter);

module.exports = router; 