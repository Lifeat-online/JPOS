import { Router } from "express";
import { requireAuth } from "../auth-middleware.js";
import { getConnection, isPostgres } from "../db.js";
import { initDb } from "../init-db.js";
import {
  createDatabaseBackup,
  getDatabaseBackupDirectory,
  listDatabaseBackups,
  readDatabaseBackup,
  restoreDatabaseBackup,
} from "../dbMaintenance.js";
import { sendSafeError } from "../securityHardening.js";
import { requireDevMaintenance } from "./_helpers.js";

export const devRouter = Router();

devRouter.get("/db-test", async (req, res) => {
  try {
    const conn = await getConnection();
    try {
      const rows = await conn.query("SELECT 1 as val");
      res.json({ status: "ok", postgres: true, rows });
    } finally {
      conn.release();
    }
  } catch (err) {
    sendSafeError(res, 500, "Database probe failed", err, req);
  }
});

devRouter.post("/init-db", async (req, res) => {
  try {
    await initDb();
    res.json({ success: true, message: "Database schema initialized successfully" });
  } catch (err) {
    sendSafeError(res, 500, "Schema initialization failed", err, req);
  }
});

devRouter.get("/backups", requireAuth, requireDevMaintenance, async (req, res) => {
  try {
    res.json({
      backupDir: getDatabaseBackupDirectory(),
      backups: await listDatabaseBackups(),
    });
  } catch (err) {
    sendSafeError(res, 500, "Failed to list database backups", err, req);
  }
});

devRouter.post("/backups", requireAuth, requireDevMaintenance, async (req, res) => {
  try {
    const backup = await createDatabaseBackup({
      createdBy: req.user?.email || req.user?.name || null,
      note: typeof req.body?.note === "string" ? req.body.note : null,
    });
    res.json({
      success: true,
      backupDir: getDatabaseBackupDirectory(),
      backup,
    });
  } catch (err) {
    sendSafeError(res, 500, "Failed to create database backup", err, req);
  }
});

devRouter.get("/backups/:backupId", requireAuth, requireDevMaintenance, async (req, res) => {
  try {
    const backup = await readDatabaseBackup(req.params.backupId);
    if (req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${backup.id}.json"`);
    }
    res.json({ backup });
  } catch (err) {
    sendSafeError(res, 404, "Database backup was not found", err, req);
  }
});

devRouter.post("/backups/:backupId/restore", requireAuth, requireDevMaintenance, async (req, res) => {
  try {
    if (req.body?.repairSchemaFirst !== false) {
      await initDb();
    }
    const result = await restoreDatabaseBackup(req.params.backupId, {
      dryRun: Boolean(req.body?.dryRun),
      overwriteExisting: Boolean(req.body?.overwriteExisting),
    });
    res.json({ success: result.totals.failed === 0, result });
  } catch (err) {
    sendSafeError(res, 500, "Failed to restore database backup", err, req);
  }
});
