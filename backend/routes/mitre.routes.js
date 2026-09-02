// backend/routes/mitre.routes.js
// MITRE ATT&CK coverage + Navigator-layer export, computed from the per-log
// mitre_techniques field, scoped to the viewer's operation.
const express = require('express');
const router = express.Router();
const { authenticateJwt } = require('../middleware/jwt.middleware');
const LogsModel = require('../models/logs');
const eventLogger = require('../lib/eventLogger');

router.use(authenticateJwt);

// Parse a log's "T1059.001,T1003" string into an array of technique IDs.
const parseTechniques = (v) => String(v || '')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

async function computeCoverage(req) {
  const logs = await LogsModel.getAllLogs(req.user.username, req.user.role === 'admin');
  const counts = new Map();
  let logsWith = 0;
  for (const l of logs) {
    const ids = parseTechniques(l.mitre_techniques);
    if (ids.length) logsWith++;
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return {
    totalLogs: logs.length,
    logsWithTechniques: logsWith,
    techniques: [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
  };
}

// Coverage summary for the ATT&CK view.
router.get('/coverage', async (req, res, next) => {
  try {
    res.json(await computeCoverage(req));
  } catch (error) {
    console.error('Error computing ATT&CK coverage:', error);
    next(error);
  }
});

// ATT&CK Navigator layer (importable at mitre-attack.github.io/attack-navigator).
router.get('/navigator', async (req, res, next) => {
  try {
    const { techniques } = await computeCoverage(req);
    const max = Math.max(1, ...techniques.map(t => t.count));
    const layer = {
      name: `Clio coverage — ${new Date().toISOString().slice(0, 10)}`,
      versions: { attack: '14', navigator: '4.9.1', layer: '4.5' },
      domain: 'enterprise-attack',
      description: 'Techniques observed in Clio, scored by number of logs.',
      gradient: { colors: ['#1e222b', '#4f8cf0'], minValue: 0, maxValue: max },
      techniques: techniques.map(t => ({
        techniqueID: t.id,
        score: t.count,
        comment: `${t.count} log${t.count !== 1 ? 's' : ''}`,
        enabled: true,
      })),
      hideDisabled: false,
    };
    await eventLogger.logAuditEvent('mitre_navigator_export', req.user.username, {
      techniqueCount: techniques.length,
    });
    res.set('Content-Disposition', `attachment; filename="clio-attack-layer-${new Date().toISOString().replace(/[:.]/g, '-')}.json"`);
    res.json(layer);
  } catch (error) {
    console.error('Error building Navigator layer:', error);
    next(error);
  }
});

module.exports = router;
