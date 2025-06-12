const express = require("express");
const prisma = require("../../prismaClient");
const router = express.Router();
const adminAuth = require("../../middleware/adminAuth");
const permissions = require("../../constants/permissons.json");

router.get("/", adminAuth , async (req, res) => {
  try {
    res.status(200).json(permissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {

  const id = parseInt(req.params.id);

  try {
    const admin = await prisma.admin.findUnique({
      where: { id: id },
      select: { permissons: true }
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.status(200).json(admin.permissons || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/add/:id", adminAuth ,  async (req, res) => {
  const { permissions: newPermissions } = req.body;
  const id = parseInt(req.params.id);
  
  try {
    const invalidPermissions = newPermissions.filter(
      perm => !permissions.includes(perm)
    );
    
    if (invalidPermissions.length > 0) {
      return res.status(400).json({ 
        error: "Invalid permissions", 
        invalidPermissions 
      });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: id},
      select: { permissons: true }
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const currentPermissions = admin.permissons || {};
    const updatedPermissions = {
      ...currentPermissions,
      ...newPermissions.reduce((acc, perm) => {
        acc[perm] = true;
        return acc;
      }, {})
    };

    const updatedAdmin = await prisma.admin.update({
      where: { id: id },
      data: { permissons: updatedPermissions },
      select: { permissons: true }
    });

    res.status(200).json(updatedAdmin.permissons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/remove/:id", adminAuth ,  async (req, res) => {
  const { permissions: permissionsToRemove } = req.body;
  const id = parseInt(req.params.id);

  try {
    const admin = await prisma.admin.findUnique({
      where: { id: id },
      select: { permissons: true }
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const currentPermissions = admin.permissons || {};
    const updatedPermissions = { ...currentPermissions };
    permissionsToRemove.forEach(perm => {
      delete updatedPermissions[perm];
    });

    const updatedAdmin = await prisma.admin.update({
      where: { id: id },
      data: { permissons: updatedPermissions },
      select: { permissons: true }
    });

    res.status(200).json(updatedAdmin.permissons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
