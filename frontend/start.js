#!/usr/bin/env node
/*
 * Dev-server launch wrapper.
 *
 * The frontend currently runs the Create React App dev server (react-scripts
 * start) inside the container. That server prints a "Local: https://localhost:3000"
 * banner, which is misleading here: port 3000 is only exposed on the internal
 * Docker network for the nginx proxy to reach — it is NOT published to the host,
 * so browsing to localhost:3000 fails with "this site can't be reached".
 *
 * This wrapper prints an accurate banner and rewrites the dev server's own
 * localhost:3000 / On-Your-Network lines so the container logs point people at
 * the real entry point (the nginx proxy) instead.
 *
 * Set CLIO_EXTERNAL_URL to show a concrete URL in the banner (e.g.
 * https://localhost:8443); otherwise a generic pointer is shown.
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

const externalUrl = process.env.CLIO_EXTERNAL_URL;
const accessHint = externalUrl
  ? externalUrl
  : 'the nginx proxy — see the port mapped to clio-nginx-proxy in `docker compose ps` (e.g. https://localhost:8443)';

console.log('');
console.log('  ┌───────────────────────────────────────────────────────────────┐');
console.log('  │  Clio frontend (in-container dev server)                        │');
console.log('  │                                                                 │');
console.log('  │  Open Clio in your browser at:                                  │');
console.log(`  │    ${accessHint}`);
console.log('  │                                                                 │');
console.log('  │  Port 3000 below is INTERNAL to the Docker network (used by     │');
console.log('  │  the nginx proxy). It is not published to your host — browsing  │');
console.log('  │  to localhost:3000 will NOT work.                               │');
console.log('  └───────────────────────────────────────────────────────────────┘');
console.log('');

const bin = path.join(__dirname, 'node_modules', '.bin', 'react-scripts');
const child = spawn(bin, ['start'], {
  env: process.env,
  stdio: ['inherit', 'pipe', 'inherit'],
});

// Rewrite the dev server's misleading URL lines as they stream past.
const rl = readline.createInterface({ input: child.stdout });
rl.on('line', (line) => {
  if (/^\s*Local:\s+https?:\/\/localhost:3000/.test(line)) {
    console.log(`  Access via:       ${externalUrl || 'nginx proxy (see docker compose ps)'}`);
    console.log('  (in-container:    https://localhost:3000 — Docker network only, not your host)');
    return;
  }
  // Drop the "On Your Network" line — that container IP is not reachable either.
  if (/^\s*On Your Network:\s+https?:\/\/[\d.]+:3000/.test(line)) {
    return;
  }
  console.log(line);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

// Forward termination signals so Ctrl-C / docker stop shut the server down cleanly.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}
