const express = require("express");
var cors = require("cors");
var cron = require("node-cron");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = 3000;
const fileUpload = require("express-fileupload");
const adminRouter = require("./routers/admin/admin");
const providerRouter = require("./routers/admin/provider");
const agentRouter = require("./routers/admin/agent");
const providerWallet = require("./routers/admin/providerWallet");
const agentWallet = require("./routers/admin/agentWallet");
const sellerRouter = require("./routers/admin/seller");
const walletRouter = require("./routers/admin/wallet");
const paymentRouter = require("./routers/admin/payment");
const cardRouter = require("./routers/admin/card");
const agentCardRouter = require("./routers/admin/agentCard");
const cardTypeRouter = require("./routers/admin/cardType");
const archiveRouter = require("./routers/admin/archive");
const planRouter = require("./routers/admin/plan");
const categoryRouter = require("./routers/admin/categories");
const stockRouter = require("./routers/admin/stock");
const providerCardsRouter = require("./routers/admin/providerCards");
const permissionsRouter = require("./routers/admin/permissions");
const providersRouter = require("./routers/provider/index");
const POSRouter = require("./routers/POS");
const { resetHoldExpired } = require("./helper/resetHoldExpired");
const { resetSellerExpiredHolds } = require("./helper/resetSellerHoldExpired");
const { initializeSocket } = require("./helper/socket");
require("dotenv").config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

const server = http.createServer(app);
initializeSocket(server);

app.get("/api", (req, res) => {
  res.json({ msg: "server is live" });
});

//Dashboard APIs
app.use("/api/test", adminRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/agent", agentRouter);
app.use("/api/admin/agent-wallet", agentWallet);
app.use("/api/admin/providers", providerRouter);
app.use("/api/admin/provider-wallet", providerWallet);
app.use("/api/admin/wallets", walletRouter);
app.use("/api/admin/payments", paymentRouter);
app.use("/api/admin/cards", cardRouter);
app.use("/api/admin/agent-card", agentCardRouter);
app.use("/api/admin/card-types", cardTypeRouter);
app.use("/api/admin/seller", sellerRouter);
app.use("/api/admin/archive", archiveRouter);
app.use("/api/admin/plan", planRouter);
app.use("/api/admin/category", categoryRouter);
app.use("/api/admin/stock", stockRouter);
app.use("/api/admin/provider-cards", providerCardsRouter);
app.use("/api/admin/permissions", permissionsRouter);


app.use("/api/provider", providersRouter);

//POS APIs
app.use("/api/pos", POSRouter);
app.use("/api/v2/pos", POSRouter);

cron.schedule("*/15 * * * *", async () => {
  await resetHoldExpired();
  await resetSellerExpiredHolds();
});

server.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// process.on('SIGINT', async () => {
//   console.log('Shutting down gracefully...');
//   await prisma.$disconnect();
//   process.exit(0);
// });
