const express = require("express");
const prisma = require("../../prismaClient");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const allPermissions = require("../../constants/permissions.json");

router.get("/all", adminAuth, async (req, res) => {
  try {
    res.status(200).json(allPermissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/add/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { permissions: newPermissions } = req.body;

  try {
    const invalidPermissions = newPermissions.filter(
      (perm) => !allPermissions.includes(perm)
    );
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        error: "Invalid permissions",
        invalidPermissions,
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id },
      select: { permissions: true },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const currentPermissions = admin.permissions || [];

    const updatedPermissions = Array.from(
      new Set([...currentPermissions, ...newPermissions])
    );

    const updatedAdmin = await prisma.admin.update({
      where: { id },
      data: { permissions: updatedPermissions },
      select: { permissions: true },
    });

    res.status(200).json(updatedAdmin.permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/remove/:id", adminAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const { permissions: permissionsToRemove } = req.body;

  try {
    const admin = await prisma.admin.findUnique({
      where: { id },
      select: { permissions: true },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const currentPermissions = admin.permissions || [];

    const updatedPermissions = currentPermissions.filter(
      (perm) => !permissionsToRemove.includes(perm)
    );

    const updatedAdmin = await prisma.admin.update({
      where: { id },
      data: { permissions: updatedPermissions },
      select: { permissions: true },
    });

    res.status(200).json(updatedAdmin.permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;