// backend/services/relations/analysisScheduler.js
// Debounce/queue logic for triggering relation analysis after log writes.
// Both server.js (cron) and route handlers import from here to avoid circular deps.

const ANALYSIS_BATCH_DELAY = 3000; // ms — wait for burst to settle before running
const MAX_ANALYSIS_QUEUE = 20;     // run immediately when this many writes queue up

let analysisQueue = [];
let analysisTimeout = null;

function scheduleRelationAnalysis() {
  // Lazy-require to avoid circular dependency at module load time
  const RelationAnalyzer = require('./relationAnalyzer');

  analysisQueue.push(Date.now());

  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
    analysisTimeout = null;
  }

  if (analysisQueue.length >= MAX_ANALYSIS_QUEUE) {
    analysisQueue = [];
    RelationAnalyzer.analyzeLogs().catch(err => console.error('Relation analysis error:', err));
    return;
  }

  analysisTimeout = setTimeout(() => {
    analysisQueue = [];
    RelationAnalyzer.analyzeLogs().catch(err => console.error('Relation analysis error:', err));
  }, ANALYSIS_BATCH_DELAY);
}

module.exports = { scheduleRelationAnalysis };
