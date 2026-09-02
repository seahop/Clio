// backend/services/export/engagementReport.js
// Builds a self-contained HTML engagement report from operation-scoped stats
// and logs. Everything is inline (styles + data) so the file opens/prints/saves
// anywhere with no external dependencies. All interpolated values are escaped.

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const fmtUtc = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return esc(v);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
};
const dayOf = (v) => { const d = new Date(v); return isNaN(d) ? 'Unknown' : d.toISOString().slice(0, 10); };
const timeOf = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toISOString().slice(11, 19) + 'Z'; };

// Status → accent color for the report (self-contained; mirrors statusMeta).
const STATUS_COLOR = {
  ON_DISK: '#e0b052', IN_MEMORY: '#7ea2e0', ENCRYPTED: '#b491e0', REMOVED: '#e86a62',
  CLEANED: '#4ac882', DORMANT: '#8a92a0', DETECTED: '#e08a4a', UNKNOWN: '#6b7280',
};
const statusColor = (s) => STATUS_COLOR[s] || '#6b7280';

function activitySvg(activity) {
  const days = 30;
  const today = new Date();
  const byDay = new Map((activity || []).map(a => [a.day, a.count]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    series.push(byDay.get(key) || 0);
  }
  const max = Math.max(1, ...series);
  const W = 600, H = 90, bw = W / days;
  const bars = series.map((c, i) => {
    const h = c === 0 ? 1 : (c / max) * (H - 6);
    return `<rect x="${(i * bw).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" fill="#4f8cf0" opacity="${c === 0 ? 0.25 : 0.9}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="90" preserveAspectRatio="none" role="img" aria-label="Activity, last 30 days">${bars}</svg>`;
}

function barRows(items, { mono = false } = {}) {
  if (!items || items.length === 0) return '<tr><td colspan="2" class="muted">No data</td></tr>';
  const max = Math.max(1, ...items.map(i => i.count));
  return items.map(it => `
    <tr>
      <td class="${mono ? 'mono' : ''}">${esc(it.name)}
        <div class="bar"><span style="width:${((it.count / max) * 100).toFixed(1)}%"></span></div>
      </td>
      <td class="num">${it.count}</td>
    </tr>`).join('');
}

function statusRows(byStatus) {
  const total = (byStatus || []).reduce((s, x) => s + x.count, 0) || 1;
  if (!byStatus || byStatus.length === 0) return '<tr><td colspan="2" class="muted">No data</td></tr>';
  return byStatus.map(s => `
    <tr>
      <td><span class="dot" style="background:${statusColor(s.status)}"></span>${esc(s.status)}
        <div class="bar"><span style="width:${((s.count / total) * 100).toFixed(1)}%;background:${statusColor(s.status)}"></span></div>
      </td>
      <td class="num">${s.count}</td>
    </tr>`).join('');
}

function timelineHtml(logs) {
  if (!logs || logs.length === 0) return '<p class="muted">No activity recorded.</p>';
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const byDay = new Map();
  for (const l of sorted) {
    const d = dayOf(l.timestamp);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(l);
  }
  let out = '';
  for (const [day, entries] of byDay) {
    out += `<h3 class="day">${esc(day)} <span class="muted">· ${entries.length} event${entries.length !== 1 ? 's' : ''}</span></h3><div class="tl">`;
    for (const l of entries) {
      out += `<div class="tl-row">
        <span class="tl-dot" style="background:${statusColor(l.status)}"></span>
        <span class="mono time">${esc(timeOf(l.timestamp))}</span>
        <div class="tl-body">
          <div class="tl-head">
            ${l.status ? `<span class="pill" style="color:${statusColor(l.status)};border-color:${statusColor(l.status)}">${esc(l.status)}</span>` : ''}
            ${l.hostname ? `<span class="host">${esc(l.hostname)}</span>` : ''}
            ${l.internal_ip ? `<span class="muted mono">${esc(l.internal_ip)}</span>` : ''}
            ${l.username ? `<span class="user">${esc(l.username)}</span>` : ''}
          </div>
          ${l.command ? `<div class="cmd mono">${esc(l.command)}</div>` : ''}
          ${l.notes ? `<div class="notes">${esc(l.notes)}</div>` : ''}
        </div>
      </div>`;
    }
    out += `</div>`;
  }
  return out;
}

function generateEngagementReport({ stats, logs, operationLabel, generatedBy, scopeNote }) {
  const s = stats || {};
  const tile = (label, value) => `<div class="tile"><div class="tile-n">${esc(value ?? 0)}</div><div class="tile-l">${esc(label)}</div></div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Clio Engagement Report — ${esc(operationLabel)}</title>
<style>
  :root{--bg:#0e1116;--surface:#171a21;--surface2:#1e222b;--line:#2a2f3a;--ink:#e6e8ec;--muted:#a2a8b4;--faint:#78808c;--accent:#4f8cf0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .wrap{max-width:920px;margin:0 auto;padding:40px 24px 80px}
  header.cover{border-bottom:2px solid var(--ink);padding-bottom:20px;margin-bottom:28px}
  .eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:0 0 10px}
  h1{font-size:30px;margin:0 0 8px;letter-spacing:-.01em}
  .meta{color:var(--muted);font-size:13px;margin:2px 0}
  h2{font-size:18px;margin:36px 0 12px;letter-spacing:-.01em}
  .muted{color:var(--muted)} .faint{color:var(--faint)}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .tile{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
  .tile-n{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
  .tile-l{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--faint);margin-top:4px}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:6px 8px 6px 0;vertical-align:top;border-bottom:1px solid var(--line)}
  td.num{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;width:48px}
  .bar{height:4px;border-radius:3px;background:var(--surface2);margin-top:5px;overflow:hidden}
  .bar span{display:block;height:100%;background:var(--accent);border-radius:3px}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle}
  h3.day{font-size:14px;margin:22px 0 8px;border-bottom:1px solid var(--line);padding-bottom:6px}
  .tl{border-left:1px solid var(--line);margin-left:4px;padding-left:16px}
  .tl-row{position:relative;padding:6px 0}
  .tl-dot{position:absolute;left:-21px;top:11px;width:9px;height:9px;border-radius:50%;box-shadow:0 0 0 3px var(--bg)}
  .time{color:var(--muted);font-size:12px;margin-right:8px}
  .tl-body{display:inline-block;vertical-align:top}
  .tl-head{display:inline}
  .pill{font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid;border-radius:10px;padding:1px 7px;margin-right:6px}
  .host{font-weight:600;margin-right:8px} .user{color:#7ea2e0;margin-right:8px}
  .cmd{font-size:12.5px;color:var(--muted);margin-top:2px;word-break:break-all}
  .notes{font-size:12.5px;color:var(--faint);font-style:italic;margin-top:2px}
  footer{margin-top:48px;padding-top:14px;border-top:1px solid var(--line);color:var(--faint);font-size:12px}
  @media print{body{background:#fff;color:#111}.tile,.card{border-color:#ccc}}
</style></head>
<body><div class="wrap">
  <header class="cover">
    <p class="eyebrow">Clio · Engagement Report</p>
    <h1>${esc(operationLabel)}</h1>
    <p class="meta">Scope: ${esc(scopeNote)}</p>
    <p class="meta">Generated ${fmtUtc(new Date())} by ${esc(generatedBy)}</p>
    <p class="meta faint">Authorized use only — contains sensitive engagement data.</p>
  </header>

  <h2>Summary</h2>
  <div class="tiles">
    ${tile('Total logs', s.total)}${tile('Hosts', s.distinctHosts)}${tile('Users', s.distinctUsers)}${tile('Locked', s.locked)}
  </div>

  <h2>Activity — last 30 days</h2>
  <div class="card">${activitySvg(s.activity)}</div>

  <div class="grid2" style="margin-top:16px">
    <div class="card"><h3 style="margin:0 0 8px;font-size:13px" class="faint">FILE STATUS MIX</h3><table>${statusRows(s.byStatus)}</table></div>
    <div class="card"><h3 style="margin:0 0 8px;font-size:13px" class="faint">TOP COMMANDS</h3><table>${barRows(s.topCommands, { mono: true })}</table></div>
    <div class="card"><h3 style="margin:0 0 8px;font-size:13px" class="faint">TOP HOSTS</h3><table>${barRows(s.topHosts)}</table></div>
    <div class="card"><h3 style="margin:0 0 8px;font-size:13px" class="faint">TOP USERS</h3><table>${barRows(s.topUsers)}</table></div>
  </div>

  <h2>Engagement Timeline</h2>
  ${timelineHtml(logs)}

  <footer>Clio Logging Platform · ${esc((logs || []).length)} events in scope · report generated ${fmtUtc(new Date())}</footer>
</div></body></html>`;
}

module.exports = { generateEngagementReport };
