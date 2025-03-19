const express = require("express");
var cors = require("cors");
var cron = require("node-cron");
// const http = require('http');
// const { Server } = require('socket.io');

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
const stockRouter = require("./routers/admin/stock");
const providerCardsRouter = require("./routers/admin/providerCards");
const POSRouter = require("./routers/POS");
const { resetHoldExpired } = require("./helper/resetHoldExpired");
require("dotenv").config();

// const server = http.createServer(app);
// const io = new Server(server, {
//     cors: {
//         origin: "*",
//         methods: ["GET", "POST"]
//     }
// });

// // Store active user sockets
// const userSockets = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);

//   socket.on('register', (userId) => {
//       userSockets.set(userId, socket.id);
//       console.log(`User ${userId} registered with socket ID: ${socket.id}`);
//   });

//   socket.on('disconnect', () => {
//       console.log('User disconnected:', socket.id);
//       for (let [userId, sockId] of userSockets) {
//           if (sockId === socket.id) {
//               userSockets.delete(userId);
//               break;
//           }
//       }
//   });
// });

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
app.use("/api/admin/stock", stockRouter);
app.use("/api/admin/provider-cards", providerCardsRouter);

//POS APIs
app.use("/api/pos", POSRouter);

cron.schedule("*/15 * * * *", async () => {
  await resetHoldExpired();
});

// Logout Endpoint
// app.post('/api/admin/pos-logout', (req, res) => {
//   const { userId } = req.body;
//   if (!userId) return res.status(400).json({ message: 'Invalid user ID' });

//   const socketId = userSockets.get(userId);
//   if (socketId) {
//       io.to(socketId).emit('forceLogout', { message: 'You have been logged out' });
//       userSockets.delete(userId);
//   }

//   res.json({ message: 'User logged out successfully' });
// });

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

// process.on('SIGINT', async () => {
//   console.log('Shutting down gracefully...');
//   await prisma.$disconnect();
//   process.exit(0);
// });
