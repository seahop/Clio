// backend/routes/export.routes.js
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');

// Import sub-routers
const csvRoutes = require('./export/csv.routes');
const evidenceRoutes = require('./export/evidence.routes');
const commonRoutes = require('./export/common.routes');

// All export routes require authentication
router.use(authenticateJwt);

// CSV export and column list — available to any authenticated user.
// The CSV controller applies operation scoping for non-admins.
router.use('/csv', csvRoutes);
router.use('/', commonRoutes);

// Everything below is admin-only
router.use('/evidence', verifyAdmin, evidenceRoutes);
router.use('/s3-status', require('./export/s3-status.routes'));

const encryptionController = require('../controllers/encryption.controller');
router.post('/encrypt-for-s3', verifyAdmin, encryptionController.encryptForS3);
router.post('/decrypt-from-s3', verifyAdmin, encryptionController.decryptFromS3);

// Full engagement report — a self-contained, printable HTML document built from
// the viewer's operation-scoped stats + logs. Returned inline so it opens in a
// browser tab (operators can print/save to PDF). Available to any authenticated
// user; scoping matches the log list.
const LogsModel = require('../models/logs');
const OperationsModel = require('../models/operations');
const { generateEngagementReport } = require('../services/export/engagementReport');
const eventLogger = require('../lib/eventLogger');

router.get('/report', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const username = req.user.username;

    const [stats, logs] = await Promise.all([
      LogsModel.getStats(username, isAdmin),
      LogsModel.getAllLogs(username, isAdmin),
    ]);

    let operationLabel = 'All Operations';
    let scopeNote = isAdmin ? 'All operations (admin view)' : 'Your active operation';
    try {
      const op = isAdmin
        ? await OperationsModel.getAdminViewOperation(username)
        : await OperationsModel.getUserActiveOperation(username);
      if (op && op.name) { operationLabel = op.name; scopeNote = `Operation: ${op.name}`; }
    } catch (_) { /* fall back to defaults */ }

    const html = generateEngagementReport({ stats, logs, operationLabel, generatedBy: username, scopeNote });

    await eventLogger.logAuditEvent('generate_engagement_report', username, {
      logCount: logs.length, scope: operationLabel, timestamp: new Date().toISOString(),
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    console.error('Error generating engagement report:', error);
    next(error);
  }
});

// Blue-team deconfliction export — a time-windowed, SANITIZED activity list for
// handing to defenders: when, from where, to what. Deliberately excludes
// commands, notes, secrets, filenames, and hashes (TTPs stay with the red team);
// it exposes only network/host identifiers needed to deconflict alerts.
const DECONFLICT_COLUMNS = ['timestamp', 'internal_ip', 'external_ip', 'mac_address', 'hostname', 'domain', 'username', 'status'];

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/deconfliction', async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const username = req.user.username;
    const format = req.query.format === 'json' ? 'json' : 'csv';

    const start = req.query.start ? new Date(req.query.start) : null;
    const end = req.query.end ? new Date(req.query.end) : null;
    if ((req.query.start && isNaN(start)) || (req.query.end && isNaN(end))) {
      return res.status(400).json({ error: 'Invalid start/end date' });
    }

    const all = await LogsModel.getAllLogs(username, isAdmin);
    const rows = all
      .filter(l => {
        const t = new Date(l.timestamp);
        if (start && t < start) return false;
        if (end && t > end) return false;
        return true;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(l => {
        const o = {};
        for (const c of DECONFLICT_COLUMNS) o[c] = l[c] ?? '';
        // Emit clean ISO 8601 UTC timestamps for defender ingestion.
        const t = new Date(l.timestamp);
        o.timestamp = isNaN(t) ? '' : t.toISOString();
        return o;
      });

    await eventLogger.logAuditEvent('deconfliction_export', username, {
      count: rows.length, format,
      window: { start: req.query.start || null, end: req.query.end || null },
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
      res.set('Content-Disposition', `attachment; filename="deconfliction_${stamp}.json"`);
      return res.json({
        note: 'Authorized red-team activity — for blue-team deconfliction. Sanitized: no commands, notes, secrets, filenames, or hashes.',
        window: { start: req.query.start || null, end: req.query.end || null },
        count: rows.length,
        activity: rows,
      });
    }
    const header = DECONFLICT_COLUMNS.join(',');
    const body = rows.map(r => DECONFLICT_COLUMNS.map(c => csvCell(r[c])).join(',')).join('\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="deconfliction_${stamp}.csv"`);
    res.send(`${header}\n${body}\n`);
  } catch (error) {
    console.error('Error generating deconfliction export:', error);
    next(error);
  }
});

module.exports = router;
