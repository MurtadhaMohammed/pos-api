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
        provider: {
          select: {
            id: true,
            name: true,
            active: true,
            createtAt: true,
          }
        },
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

router.get("/download/:id", adminAuth, async (req, res) => {
  const { permissions = [], type: userType } = req.user;

  try {
    if (userType !== 'ADMIN' || !permissions.includes("superadmin") && !permissions.includes("read_archive")) {
      return res.status(400).json({ error: "No permission to download archive" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid ID!" });
    }

    const archive = await prisma.archive.findUnique({
      where: { id },
      include: {
        stock: {
          select: {
            id: true, serial: true, code: true, status: true,
            createdAt: true, sold_at: true, sellerId: true,
            seller: { select: { id: true, name: true, username: true } }
          }
        },
        provider: { select: { id: true, name: true } },
        plan: { select: { id: true, title: true } }
      }
    });

    if (!archive) {
      return res.status(404).json({ error: "This archive is not available!" });
    }

    if (!archive.stock?.length) {
      return res.status(400).json({ error: "There is no stock for this archive!" });
    }

    const archiveCreatedAt = dayjs(archive.createtAt);
    const invalidStock = archive.stock.filter(
      (item) =>
        Math.abs(archiveCreatedAt.diff(dayjs(item.createdAt), "minute")) > 1
    );


    if (invalidStock.length > 0) {
      return res.status(400).json({ 
        error: `Some items in the stock have a different creation date than the archive creation date. Please check the data.` 
      });
    }

    const workbook = XLSX.utils.book_new();
    
    const worksheet = {};
    
    const headerStyle = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "medium" },
        bottom: { style: "medium" },
        left: { style: "medium" },
        right: { style: "medium" }
      }
    };

    const dataStyle = {
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      }
    };

    const stockHeaders = ['ID', 'Serial', 'Code', 'Status', 'Created At', 'Sold At', 'Seller ID', 'Seller Name', 'Seller Username'];
    
    stockHeaders.forEach((header, index) => {
      const col = String.fromCharCode(65 + index);
      worksheet[`${col}1`] = { v: header, s: headerStyle };
    });

    const stockData = archive.stock.map(item => ({
      'ID': item.id,
      'Serial': item.serial,
      'Code': item.code,
      'Status': item.status,
      'Created At': dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss'),
      'Sold At': item.sold_at ? dayjs(item.sold_at).format('YYYY-MM-DD HH:mm:ss') : '',
      'Seller ID': item.sellerId || '',
      'Seller Name': item.seller?.name || '',
      'Seller Username': item.seller?.username || ''
    }));

    stockData.forEach((item, index) => {
      const rowIndex = index + 2;
      const values = Object.values(item);
      
      values.forEach((value, colIndex) => {
        const col = String.fromCharCode(65 + colIndex);
        worksheet[`${col}${rowIndex}`] = { 
          v: value, 
          s: dataStyle
        };
      });
    });

    const archiveInfo = [
      ['Archive ID', archive.id],
      ['Group Title', archive.group_title],
      ['Quantity', archive.qty],
      ['Reception Date', archive.reciption_date ? dayjs(archive.reciption_date).format('YYYY-MM-DD') : ''],
      ['Note', archive.note || ''],
      ['Active', archive.active ? 'Yes' : 'No'],
      ['Created At', dayjs(archive.createtAt).format('YYYY-MM-DD HH:mm:ss')],
      ['Provider ID', archive.provider?.id || ''],
      ['Provider Name', archive.provider?.name || ''],
      ['Plan ID', archive.plan?.id || ''],
      ['Plan Title', archive.plan?.title || '']
    ];

    const startRow = stockData.length + 3;
    
    worksheet[`A${startRow}`] = { 
      v: 'Archive Information', 
      s: {
        font: { bold: true, size: 14 },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "medium" },
          bottom: { style: "medium" },
          left: { style: "medium" },
          right: { style: "medium" }
        }
      }
    };
    
    worksheet['!merges'] = [{ s: { c: 0, r: startRow - 1 }, e: { c: 1, r: startRow - 1 } }];

    const infoLabelStyle = {
      font: { bold: true },
      alignment: { horizontal: "left", vertical: "center" },
      border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      }
    };

    const infoValueStyle = {
      alignment: { horizontal: "left", vertical: "center" },
      border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      }
    };

    archiveInfo.forEach(([field, value], index) => {
      const row = startRow + 1 + index;
      worksheet[`A${row}`] = { v: field, s: infoLabelStyle };
      worksheet[`B${row}`] = { v: value, s: infoValueStyle };
    });

    worksheet['!cols'] = [
      { wch: 12 }, // ID
      { wch: 20 }, // Serial
      { wch: 15 }, // Code
      { wch: 12 }, // Status
      { wch: 20 }, // Created At
      { wch: 20 }, // Sold At
      { wch: 12 }, // Seller ID
      { wch: 20 }, // Seller Name
      { wch: 20 }  // Seller Username
    ];
    
    worksheet['!rows'] = [
      { hpt: 25 }, // Header row
      ...Array(stockData.length).fill({ hpt: 20 }), // Data rows
      { hpt: 15 }, // Empty row
      { hpt: 25 }, // Archive info title
      ...Array(archiveInfo.length).fill({ hpt: 20 }) // Archive info rows
    ];
    
    const totalRows = startRow + archiveInfo.length;
    worksheet['!ref'] = `A1:I${totalRows}`;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Archive Data');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `archive_${archive.id}_${dayjs().format('YYYY-MM-DD')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Error in server!" });
  }
});
module.exports = router;
