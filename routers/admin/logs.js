const express = require("express");
const prisma = require("../../prismaClient");
const adminAuth = require("../../middleware/adminAuth");
const router = express.Router();

// Get all Logs
router.get("/", adminAuth, async (req, res) => {
  try {
    const take = Math.min(parseInt(req.query.take || 8, 10), 100);
    const skip = parseInt(req.query.skip || 0, 10);

    const q = (req.query.q || "").toString().trim();
    const userId = req.query.userId
      ? parseInt(req.query.userId, 10)
      : undefined;

    const path = (req.query.path || "").toString().trim();

    const status = req.query.status
      ? parseInt(req.query.status, 10)
      : undefined;

    // date range with validation
    const parseMaybeDate = (s) => {
      if (!s) return undefined;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const from = parseMaybeDate(req.query.from);
    const to = parseMaybeDate(req.query.to);

    // sort whitelist
    const allowedSort = new Set(["timestamp", "status", "userId", "userName"]);
    const sortByRaw = (req.query.sortBy || "timestamp").toString();
    const sortBy = allowedSort.has(sortByRaw) ? sortByRaw : "timestamp";
    const sortOrder =
      (req.query.sortOrder || "desc").toString().toLowerCase() === "asc"
        ? "asc"
        : "desc";

    /** @type {import('@prisma/client').Prisma.AuditLogWhereInput} */
    const where = {};

    if (q) {
      where.OR = [
        { userName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { path: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
        { userAgent: { contains: q, mode: "insensitive" } },
      ];
    }

    if (typeof userId === "number" && !Number.isNaN(userId)) {
      where.userId = userId;
    }

    if (path) {
      where.path = { contains: path, mode: "insensitive" };
    }

    if (typeof status === "number" && !Number.isNaN(status)) {
      where.status = status;
    }

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = from;
      if (to) where.timestamp.lte = to;
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        take,
        skip,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    res.json({ records: logs, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

module.exports = router;
