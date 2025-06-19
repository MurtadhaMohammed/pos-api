const express = require("express");
const router = express.Router();
const paymentRouter = require("./payment");
const sellerRouter = require("./seller");
const walletRouter = require("./wallet");

router.use("/payment", paymentRouter);
router.use("/seller", sellerRouter);
router.use("/wallet", walletRouter);
router.use("/card", cardRouter);
router.use("/plan", planRouter);

module.exports = router; 