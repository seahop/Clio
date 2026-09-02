// backend/routes/events.routes.js
// Server-Sent Events stream for live updates. Clients open one EventSource and
// receive lightweight change notifications ({type, action, id}); they then
// re-fetch through the normal operation-scoped APIs, so no data crosses scope.
// Also drives presence ("who's viewing") for live collaboration cues.
const express = require('express');
const router = express.Router();
const { authenticateJwt } = require('../middleware/jwt.middleware');
const eventBus = require('../lib/eventBus');
const presence = require('../lib/presence');

// Current presence roster (for initial paint before the first SSE presence event).
router.get('/presence', authenticateJwt, (req, res) => {
  res.json({ users: presence.roster() });
});

router.get('/stream', authenticateJwt, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // ask nginx not to buffer this response
  });
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`event: ${event.type || 'message'}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Greet the client so it knows the stream is live.
  send({ type: 'connected' });

  const unsubscribe = eventBus.subscribe(send);

  // Register presence and announce the updated roster to everyone (including
  // this client, which is now subscribed).
  presence.add(req.user.username);
  eventBus.publish({ type: 'presence', users: presence.roster() });

  // Heartbeat comment every 25s keeps proxies/browsers from timing the idle
  // connection out (SSE comments start with ':').
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    presence.remove(req.user.username);
    eventBus.publish({ type: 'presence', users: presence.roster() });
    res.end();
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = router;
