const prisma = require("../prismaClient");

// audit.js
// const AUDIT_TRACKS = [
//   {
//     pattern: "/api/admin/archive/active/:id",
//     method: "PUT",
//     action: "UPDATE_ARCHIVE_ACTIVE",
//   },
//   {
//     pattern: "/api/admin/archive/:id",
//     method: "DELETE",
//     action: "DELETE_ARCHIVE",
//   },
// ];

// simple param matcher: /api/xxx/:id -> ^/api/xxx/[^/]+$
// function toRegex(pattern) {
//   return new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
// }

// function matchAction(method, path) {
//   for (const t of AUDIT_TRACKS) {
//     if (t.method !== method) continue;
//     if (toRegex(t.pattern).test(path)) return t.action;
//   }
//   return null;
// }

async function auditLog(req, res, userType, action) {
  path = req.baseUrl + req.path;
//   const action = matchAction(req.method, path);
  const ipHeader = String(req.headers["x-forwarded-for"] || "");
  const ip = ipHeader.split(",")[0].trim() || req.ip || null;

  if (!action) {
    return; // No action to log
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user?.id ?? null,
        userName: req.user?.username ?? null,
        userType: userType ?? "GUST",
        action,
        path,
        ip,
        userAgent: req.get("user-agent") || null,
        status: res.statusCode,
      },
    });
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
}

module.exports = { auditLog };
