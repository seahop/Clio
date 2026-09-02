// backend/routes/audit.routes.js
// Read-only viewer over the security/audit/data/system event logs that the
// platform already records via eventLogger. Admin-only.
const express = require('express');
const router = express.Router();
const { authenticateJwt, verifyAdmin } = require('../middleware/jwt.middleware');
const eventLogger = require('../lib/eventLogger');

const LOG_TYPES = ['security', 'audit', 'data', 'system'];

router.use(authenticateJwt, verifyAdmin);

// Available categories (for the UI's filter tabs)
router.get('/types', (req, res) => res.json({ types: LOG_TYPES }));

// GET /api/audit/events?types=security,audit&type=login&username=&severity=&limit=&offset=
// Merges the requested categories, newest first, with a total count for paging.
router.get('/events', async (req, res, next) => {
  try {
    const requested = String(req.query.types || '')
      .split(',').map(s => s.trim()).filter(t => LOG_TYPES.includes(t));
    const types = requested.length ? requested : LOG_TYPES;

    const filter = {
      type: req.query.type || undefined,
      username: req.query.username || undefined,
      severity: req.query.severity || undefined,
      startDate: req.query.startDate || undefined,
      endDate: req.query.endDate || undefined,
    };

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    // Pull each category (filtered but unpaginated), tag with its category,
    // merge, sort by time desc, then paginate the combined stream.
    const perType = await Promise.all(
      types.map(async (t) => (await eventLogger.getLogs(t, filter)).map(e => ({ ...e, category: t })))
    );
    const all = perType.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      total: all.length,
      returned: Math.min(limit, Math.max(0, all.length - offset)),
      offset,
      events: all.slice(offset, offset + limit),
    });
  } catch (error) {
    console.error('Error reading audit events:', error);
    next(error);
  }
});

module.exports = router;
