const express = require("express");
const prisma = require("../../prismaClient");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const permissions = require("../../constants/permissions.json");
const dayjs = require("dayjs");
const { otpLimiter } = require("../../middleware/rateLimit");
const { CodeStatus } = require("@prisma/client");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const allPermissions = require("../../constants/permissions.json");

const JWT_SECRET = process.env.JWT_SECRET; // Replace with your actual secret

// Register Admin
// router.post("/register", async (req, res) => {
//   const { name, phone, username, password, type } = req.body;
//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const admin = await prisma.admin.create({
//       data: { name, phone, type, username, password: hashedPassword },
//     });
//     res.json(admin);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Reset Password
router.post("/reset", adminAuth, async (req, res) => {
  const { username, password } = req.body;
  const userPermissions = req.user.permissions || [];
  const userType = req.user.type;

  if (userType !== 'ADMIN' || !userPermissions.includes("superadmin")) {
    return res.status(403).json({ error: "No permission to reset admin password!" });
  }

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

router.get("/permissions", adminAuth, async (req, res) => {
  const id = req.user.id;
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: parseInt(id) },
    });
    res
      .status(200)
      .json({ success: true, permissions: admin?.permissions || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/permissions/all", adminAuth, async (req, res) => {
  try {
    res.status(200).json(allPermissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/permissions", async (req, res) => {
  try {
    res.status(200).json(permissions);
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
      permissions: admin.permissions || []
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "7d" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/all", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  if (userType !== 'ADMIN' || !permissions.includes("superadmin")) {
    return res.status(403).json({ error: "No permission to read admin!" });
  }   

  try {
    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const q = req.query.q || "";
    
    const where = {
      active: true,
      ...(q && {
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            username: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            phone: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      }),
    };
    
    const total = await prisma.admin.count({ where });
    
    const admins = await prisma.admin.findMany({
      where,
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        type: true,
        active: true,
        permissions: true,
        provider: {
          select: {
            id: true,
            name: true,
            active: true
          }
        }
      },
      take,
      skip,
      orderBy: {
        id: "desc",
      },
    });

    const response = { data: admins, total, message: "Admins fetched successfully" };
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/:id/permissions", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { permissions: newPermissions } = req.body;
  const userPermissions = req.user.permissions || [];
  const userType = req.user.type;
  const userId = req.user.id;

  if (parseInt(id) === userId) {
    return res.status(403).json({ error: "You cannot modify your own permissions!" });
  }

  if (userType !== "ADMIN" || !userPermissions.includes("superadmin")) {
    return res
      .status(403)
      .json({ error: "No permission to update admin permissions!" });
  }  

  try {
    const invalidPermissions = newPermissions.filter(
      (perm) => !permissions.includes(perm)
    );
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        error: "Invalid permissions",
        invalidPermissions,
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: parseInt(id) },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const updatedAdmin = await prisma.admin.update({
      where: { id: parseInt(id) },
      data: { permissions: newPermissions },
      select: {
        id: true,
        name: true,
        username: true,
        permissions: true,
      },
    });

    res.status(200).json({
      data: updatedAdmin,
      message: "Admin permissions updated successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/create", adminAuth, async (req, res) => {
  const { name, username, password, type, phone } = req.body;
  const userPermissions = req.user.permissions || [];
  const userType = req.user.type;

  if (userType !== 'ADMIN' && !userPermissions.includes("superadmin")) {
    return res.status(403).json({ error: "No permission to create admin!" });
  }

  try {
    if (!name || !username || !password || !type || !phone) {
      return res.status(400).json({ error: "All fields are required: name, username, password, type, and phone" });
    }

    const validTypes = ['ADMIN', 'PROVIDER'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Invalid admin type. Must be either 'ADMIN' or 'PROVIDER'" });
    }

    const existingAdmin = await prisma.admin.findFirst({
      where: {
        OR: [
          { username },
          { phone }
        ]
      }
    });

    if (existingAdmin) {
      return res.status(400).json({ error: "Username or phone number already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await prisma.admin.create({
      data: { 
        name, 
        username, 
        password: hashedPassword, 
        type,
        phone,
        active: true,
        permissions: []
      }
    });

    res.status(201).json({ 
      message: "Admin created successfully",
    });
  } catch (error) {
    console.error("Error creating admin:", error);
    res.status(500).json({ error: "Failed to create admin" });
  }
});

module.exports = router;
