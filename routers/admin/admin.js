const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const permissons = require("../../constants/permissons.json");
const dayjs = require("dayjs");
const { otpLimiter } = require("../../middleware/rateLimit");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Register Admin
// router.post("/register", async (req, res) => {
//   const { name, username, password, type } = req.body;
//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const admin = await prisma.admin.create({
//       data: { name, type, username, password: hashedPassword },
//     });
//     res.json(admin);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Register Admin
router.post("/reset", adminAuth, async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.update({
      where: { username },
      data: { password: hashedPassword },
    });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login Admin
router.post("/login", async (req, res) => {
  const { phone, password } = req.body;
  try {
    const admin = await prisma.admin.findFirst({
      where: { phone, active: true },
      include: { provider: true },
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    if (admin.provider && !admin.provider.active) {
      return res.status(403).json({ error: "Provider account is not active" });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid password!." });
    }

    if (admin.isHajji) {
      const tokenPayload = {
        id: admin.id,
        username: admin.username,
        type: admin.type,
        providerId: admin?.provider?.id,
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });
      return res.json({ message: "Login successful", success: true, token });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        otpCode: otp,
        otpUpdateAt: dayjs().toISOString(),
      },
    });

    if (process.env.IS_DEV) {
      return res.json({ message: "OTP sent via WhatsApp", success: true, otp });
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: `964${phone.replace(/^0+/, "")}`,
      type: "template",
      template: {
        name: "auth",
        language: { code: "ar" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: otp }],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: otp }],
          },
        ],
      },
    };

    const response = await fetch(
      "https://graph.facebook.com/v22.0/290765060788261/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Failed to send WhatsApp message:", data);
      return res.status(500).json({ error: "Failed to send OTP via WhatsApp" });
    }

    res.json({ message: "OTP sent via WhatsApp", success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify", async (req, res) => {
  const { phone, otp } = req.body;
  try {
    const admin = await prisma.admin.findUnique({
      where: { phone, otpCode: otp, active: true },
      include: { provider: true },
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid phone or OTP!." });
    }

    if (admin.provider && !admin.provider.active) {
      return res.status(403).json({ error: "Provider account is not active" });
    }

    const isExpired =
      new Date().getTime() - new Date(admin.otpUpdateAt).getTime() >
      5 * 60 * 1000;

    if (isExpired) {
      return res.status(400).json({ error: "OTP code expired" });
    }

    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        otpCode: null,
        otpUpdateAt: null,
      },
    });

    const tokenPayload = {
      id: admin.id,
      username: admin.username,
      type: admin.type,
      providerId: admin?.provider?.id,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/permissons", async (req, res) => {
  try {
    res.status(200).json(permissons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
