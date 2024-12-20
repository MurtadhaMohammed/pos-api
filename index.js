const express = require("express");
var cors = require("cors");
const app = express();
const port = 3000;
const adminRouter = require("./routers/admin/admin");
const providerRouter = require("./routers/admin/provider");
const providerWallet = require("./routers/admin/providerWallet");
const sellerRouter = require("./routers/admin/seller");
const walletRouter = require("./routers/admin/wallet");
const paymentRouter = require("./routers/admin/payment");
const cardRouter = require("./routers/admin/card");
const cardTypeRouter = require("./routers/admin/cardType");
const POSRouter = require("./routers/POS");
require("dotenv").config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api", (req, res) => {
  res.json({ msg: "server is live" });
});

//Dashboard APIs
app.use("/api/test", adminRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/providers", providerRouter);
app.use("/api/admin/provider-wallet", providerWallet);
app.use("/api/admin/wallets", walletRouter);
app.use("/api/admin/payments", paymentRouter);
app.use("/api/admin/cards", cardRouter);
app.use("/api/admin/card-types", cardTypeRouter);
app.use("/api/admin/seller", sellerRouter);

//POS APIs
app.use("/api/pos", POSRouter);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
