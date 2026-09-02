// backend/lib/eventBus.js
// Tiny in-process pub/sub used to push live updates to connected SSE clients.
// Single-process only (compose default). With backend.replicas > 1 this would
// need a shared broker (Redis pub/sub) — noted in the roadmap.
const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Many SSE clients can subscribe; lift the default 10-listener cap.
    this.setMaxListeners(0);
  }

  // Broadcast a change notification. Payloads are intentionally minimal
  // (type/action/id only) — no log content — so nothing crosses operation
  // boundaries; clients re-fetch through the operation-scoped APIs.
  publish(event) {
    this.emit('event', { ...event, at: new Date().toISOString() });
  }

  subscribe(handler) {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

module.exports = new EventBus();
