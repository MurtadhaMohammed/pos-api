const { Server } = require("socket.io");

let io;
let connectedUsers = {};

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust as needed
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  io.on("connection", (socket) => {
    // console.log(`🔗 New client connected: ${socket.id}`);

    const userId = socket.handshake.query.userId;

    if (userId) {
      connectedUsers[userId] = socket.id; // Associate socket ID with user ID
      console.log(`User ${userId} connected with socket ID ${socket.id}`);
    }

    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getSocketInstance = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

module.exports = { initializeSocket, getSocketInstance, connectedUsers };
