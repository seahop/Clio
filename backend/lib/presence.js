// backend/lib/presence.js
// Tracks which users currently hold an open SSE connection (a user may have
// several tabs → reference-counted). Single-process only, like eventBus.
const counts = new Map();

module.exports = {
  add(username) {
    if (!username) return;
    counts.set(username, (counts.get(username) || 0) + 1);
  },
  remove(username) {
    if (!username) return;
    const n = (counts.get(username) || 0) - 1;
    if (n <= 0) counts.delete(username);
    else counts.set(username, n);
  },
  // Distinct usernames currently connected, sorted for stable rendering.
  roster() {
    return [...counts.keys()].sort();
  },
};
