const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();
const XLSX = require("xlsx");
const dayjs = require("dayjs");

// Create  Archive
router.post("/", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  try {

    if (userType !== 'ADMIN' || (!permissions.includes("superadmin") && !permissions.includes("create_archive"))) {
      return res.status(400).json({ error: "No permission to create archive" });
    }

    if (!req.files) {
      return res.status(400).send("No file uploaded.");
    }

    const { group_title, planId, providerId, reciption_date, note } = req.body;
    let xlsxFile = req.files.file;

    if (
      xlsxFile.mimetype !==
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return res.status(400).send("Only XLSX files are allowed.");
    }
    const workbook = XLSX.read(xlsxFile.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    const header = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
    });

    const headers = header.length > 0 ? header[0] : [];

    if (!headers?.includes("id") || !headers?.includes("code")) {
      return res.status(500).json({ error: "صيغة الفايل غير صحيحة" });
    }

    const archiveData = {
      group_title,
      planId: parseInt(planId),
      providerId: parseInt(providerId),
      reciption_date: dayjs(reciption_date).toISOString(),
      note,
    };

    const stockData = sheetData?.map((el) => ({
      planId: parseInt(planId),
      providerId: parseInt(providerId),
      code: String(el?.code),
      serial: String(el?.id),
    }));

    const [archive] = await prisma.$transaction([
      prisma.archive.create({
        data: {
          ...archiveData,
          qty: stockData.length,
        },
      }),
      prisma.stock.createMany({
        data: stockData.map((el) => ({
          ...el,
          archiveId: undefined,
        })),
      }),
    ]);

    await prisma.stock.updateMany({
      where: {
        planId: parseInt(planId),
        providerId: parseInt(providerId),
        archiveId: null,
      },
      data: {
        archiveId: archive.id,
      },
    });

    res.json({
      message: "File uploaded and processed successfully!",
      archive,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  try {

    if (userType !== 'ADMIN' || (!permissions.includes("superadmin") && !permissions.includes("read_archive"))) {
      return res.status(400).json({ error: "No permission to read archive" });
    }

    const take = parseInt(req.query.take || 8);
    const skip = parseInt(req.query.skip || 0);
    const planId = parseInt(req.query.planId) || undefined;
    const providerId = parseInt(req.query.providerId) || undefined;

    const where = {
      AND: [
        {
          planId,
        },
        { providerId },
      ],
    };

    const total = await prisma.archive.count({ where });
    const archives = await prisma.archive.findMany({
      where,
      include: {
        provider: true,
        plan: true,
      },
      take,
      skip,
      orderBy: {
        createtAt: "desc",
      },
    });
    res.json({ data: archives, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;
  try {

    if (userType !== 'ADMIN' || (!permissions.includes("superadmin") && !permissions.includes("delete_archive"))) {
      return res.status(400).json({ error: "No permission to delete archive" });
    }

    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: "معرف غير صالح!." });
    }

    // Check if the archive exists
    const archive = await prisma.archive.findUnique({
      where: { id },
    });

    if (!archive) {
      return res.status(404).json({ error: "هذا العنصر غير متاح!." });
    }

    // Check if any stock item is sold (not "Ready")
    const soldStock = await prisma.stock.findFirst({
      where: {
        archiveId: id,
        status: {
          not: "Ready",
        },
      },
    });

    if (soldStock) {
      return res.status(400).json({ error: "يوجد كروت مباعه من هذه الوجبة!." });
    }

    // Perform the delete operation inside a transaction
    await prisma.$transaction([
      prisma.stock.deleteMany({
        where: { archiveId: id },
      }),
      prisma.archive.delete({
        where: { id },
      }),
    ]);

    res.json({ message: "تم حذف الوجبة والمخزون بنجاح!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/active/:id", adminAuth, async (req, res) => {
  const permissions = req.user.permissions || [];
  const userType = req.user.type;

  try {

    if (userType !== 'ADMIN' || (!permissions.includes("superadmin") && !permissions.includes("archive_status"))) {
      return res.status(400).json({ error: "No permission to archive status" });
    }

    const id = parseInt(req.params.id);
    const { active } = req.body;
    await prisma.archive.update({
      where: {
        id,
      },
      data: {
        active,
      },
    });
    res.json({ message: "تم تعديل الوجبة والمخزون بنجاح!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
