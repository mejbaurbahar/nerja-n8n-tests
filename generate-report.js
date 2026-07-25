#!/usr/bin/env node
'use strict';
const fs = require('fs');

// ── Data ───────────────────────────────────────────────────────────────────
let results;
try {
  results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
} catch {
  results = { timestamp: new Date().toISOString(), runNumber: 0, total: 0, passed: 0, failed: 0, retried: 0, duration: 0, suites: [] };
}

let bugs = [];
try {
  const bugData = JSON.parse(fs.readFileSync('browser-bugs.json', 'utf8'));
  bugs = bugData.bugs || [];
} catch { bugs = []; }

// ── Real Nerja AI logo from dev.nerja.ai ───────────────────────────────────
const NERJA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16.84 -26.99 153.98 153.98" width="32" height="32" aria-label="Nerja AI">
  <path fill="#35F5C6" d="M65.94,35.12c-0.09,1.42-0.26,2.84-0.43,4.26c-0.1,0.89-0.37,1.75-0.79,2.54l-9.05,17.01 C51.2,66.02,46.72,73.1,42.24,80.2c-3.02,4.79-6.22,9.49-8.98,14.43c-1.52,2.72-3.43,3.15-6.19,2.79 C5.45,94.59-6.92,70.6,4.1,51.65c9.3-15.99,19.53-31.44,29.56-47c0.74-1.16,3.15-1.91,4.7-1.78 C54.37,4.22,66.92,19.01,65.94,35.12z" />
  <path fill="#1DCCFF" d="M115.46,50.29c-9.27,14.84-18.7,29.58-27.89,44.48c-1.54,2.5-3.24,3-5.88,2.67 c-16.8-2.11-28.89-17.42-26.94-34.26c0-0.01,0-0.02,0-0.03c0.26-2.23,0.93-4.39,1.97-6.38l8.31-15.83 C71.65,30.43,78.28,19.91,84.91,9.4c0.2-0.32,0.39-0.64,0.59-0.96c4.21-6.7,5.01-6.99,12.75-4.61 C118.04,9.9,126.49,32.62,115.46,50.29z" />
</svg>`;

const SUITE_META = {
  '01': { icon: '🔐', label: 'Auth Tests',            color: '#9b6dff', dim: 'rgba(155,109,255,0.13)' },
  '02': { icon: '📝', label: 'Registration',           color: '#4db8d4', dim: 'rgba(77,184,212,0.13)'  },
  '03': { icon: '🌐', label: 'Public Pages',           color: '#4cbb7f', dim: 'rgba(76,187,127,0.13)'  },
  '04': { icon: '🖥',  label: 'App Pages',              color: '#f0a030', dim: 'rgba(240,160,48,0.13)'  },
  '05': { icon: '🔓', label: 'Session & Logout',       color: '#e05252', dim: 'rgba(224,82,82,0.13)'   },
  '06': { icon: '🛡',  label: 'Security Headers',       color: '#ff7043', dim: 'rgba(255,112,67,0.13)'  },
  '07': { icon: '⚙',  label: 'API Correctness',        color: '#26c6da', dim: 'rgba(38,198,218,0.13)'  },
  '08': { icon: '🤖', label: 'AI Tests (Ollama)',       color: '#9b6dff', dim: 'rgba(155,109,255,0.13)' },
};

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── N8N-style workflow canvas ──────────────────────────────────────────────
function n8nCanvas() {
  const nW = 110, nH = 80;
  const cW = 54;
  const nodeStep = nW + cW;
  const pad = 52;
  const mainY = 128;

  const suiteList = results.suites || [];
  const numSuites = suiteList.length;
  const allPass = results.failed === 0 && results.total > 0;

  const failedSuiteIdxs = suiteList
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.failed > 0)
    .map(({ i }) => i);
  const hasRetryRow = failedSuiteIdxs.length > 0;
  const retryRowY = mainY + nH / 2 + 70;
  const canvasH = hasRetryRow ? retryRowY + nH / 2 + 48 : mainY + nH / 2 + 60;

  // Build node list
  const nodes = [];

  nodes.push({
    id: 'trigger', type: 'trigger',
    x: pad, y: mainY - nH / 2,
    icon: '⚡', color: '#f97316',
    label: 'Schedule', sublabel: 'Hourly · Manual',
  });

  suiteList.forEach((suite, i) => {
    const m = SUITE_META[suite.id] || { icon: '▶', label: suite.name || 'Suite', color: '#64748b' };
    const retried = (suite.tests || []).filter(t => t.retried).length;
    nodes.push({
      id: 'suite-' + suite.id, type: 'suite',
      x: pad + (i + 1) * nodeStep, y: mainY - nH / 2,
      icon: m.icon, color: m.color,
      label: m.label,
      sublabel: suite.passed + '/' + suite.total + (retried > 0 ? ' · ↻' + retried : ''),
      ok: suite.failed === 0,
      suite,
    });
  });

  const aiX = pad + (numSuites + 1) * nodeStep;
  nodes.push({
    id: 'ai', type: 'meta',
    x: aiX, y: mainY - nH / 2,
    icon: '🤖', color: '#9b6dff',
    label: 'AI Analysis', sublabel: 'qwen2.5:0.5b',
  });

  const repX = pad + (numSuites + 2) * nodeStep;
  nodes.push({
    id: 'report', type: 'meta',
    x: repX, y: mainY - nH / 2,
    icon: '📊', color: '#4db8d4',
    label: 'HTML Report', sublabel: 'Dashboard',
  });

  const depX = pad + (numSuites + 3) * nodeStep;
  nodes.push({
    id: 'deploy', type: 'meta',
    x: depX, y: mainY - nH / 2,
    icon: allPass ? '🚀' : '⏸', color: allPass ? '#4cbb7f' : '#64748b',
    label: 'Deploy', sublabel: 'GitHub Pages',
    ok: allPass,
  });

  const totalW = pad + (numSuites + 4) * nodeStep + pad;

  // Group boxes
  let groupRects = '';
  if (numSuites > 0) {
    const gx = pad + nodeStep - 14;
    const gy = mainY - nH / 2 - 22;
    const gw = numSuites * nodeStep - cW + 28;
    const gh = nH + 44;
    groupRects += '<rect x="' + gx + '" y="' + gy + '" width="' + gw + '" height="' + gh + '" rx="8"' +
      ' fill="rgba(254,252,232,0.92)" stroke="#fde68a" stroke-width="1.5"/>' +
      '<text x="' + (gx + 10) + '" y="' + (gy - 7) + '" font-size="9.5" font-weight="700"' +
      ' fill="#92400e" font-family="-apple-system,system-ui,sans-serif" letter-spacing="0.3">TEST SUITES</text>';
  }
  {
    const gx2 = aiX - 14;
    const gy2 = mainY - nH / 2 - 22;
    const gw2 = 3 * nodeStep - cW + 28;
    const gh2 = nH + 44;
    groupRects += '<rect x="' + gx2 + '" y="' + gy2 + '" width="' + gw2 + '" height="' + gh2 + '" rx="8"' +
      ' fill="rgba(219,234,254,0.92)" stroke="#93c5fd" stroke-width="1.5"/>' +
      '<text x="' + (gx2 + 10) + '" y="' + (gy2 - 7) + '" font-size="9.5" font-weight="700"' +
      ' fill="#1e40af" font-family="-apple-system,system-ui,sans-serif" letter-spacing="0.3">CI PIPELINE</text>';
  }

  // Main row connector paths
  let paths = '';
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const x1 = a.x + nW, y1 = mainY;
    const x2 = b.x, y2 = mainY;
    const dx = (x2 - x1) / 2;
    paths += '<path d="M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2 + '"' +
      ' stroke="#b0bec5" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>';
    if (i === 0 && numSuites > 0) {
      paths += '<text x="' + (x1 + 4) + '" y="' + (y1 - 6) + '" font-size="8.5" fill="#4cbb7f"' +
        ' font-family="ui-monospace,monospace">true</text>';
    }
  }

  // Retry branch paths and nodes
  let retryPaths = '';
  let retryDivs = '';

  failedSuiteIdxs.forEach(function(suiteIdx) {
    const sNode = nodes[suiteIdx + 1];
    const scx = sNode.x + nW / 2;
    const downY1 = mainY + nH / 2;
    const downY2 = retryRowY - nH / 2;

    retryPaths += '<path d="M' + scx + ',' + downY1 + ' C' + scx + ',' + (downY1 + 28) + ' ' + scx + ',' + (downY2 - 28) + ' ' + scx + ',' + downY2 + '"' +
      ' stroke="#e05252" stroke-width="1.5" stroke-dasharray="5,3" fill="none" marker-end="url(#arrFail)"/>' +
      '<text x="' + (scx + 5) + '" y="' + ((downY1 + downY2) / 2 + 4) + '" font-size="8.5" fill="#e05252"' +
      ' font-family="ui-monospace,monospace">false</text>';

    const rx = sNode.x;
    const ry = retryRowY - nH / 2;
    retryDivs += '<div title="Auto-retry — up to 3 attempts with 2s delay" style="position:absolute;left:' + rx + 'px;top:' + ry + 'px;' +
      'width:' + nW + 'px;height:' + nH + 'px;background:#fff;border:1.5px dashed #e05252;border-radius:8px;' +
      'box-shadow:0 2px 10px rgba(224,82,82,0.15);display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:3px;padding:6px;font-family:-apple-system,system-ui,sans-serif;user-select:none;">' +
      '<div style="width:38px;height:38px;border-radius:8px;background:rgba(224,82,82,0.1);' +
      'display:flex;align-items:center;justify-content:center;font-size:20px;color:#e05252;">↻</div>' +
      '<div style="text-align:center;line-height:1.3;">' +
      '<div style="font-size:9.5px;font-weight:700;color:#e05252;">Retry (3×)</div>' +
      '<div style="font-size:8px;color:#9ca3af;font-family:ui-monospace,monospace;">2s delay</div>' +
      '</div></div>';

    const nextMainNode = nodes[suiteIdx + 2];
    if (nextMainNode) {
      const upX1 = rx + nW, upY1 = retryRowY;
      const upX2 = nextMainNode.x, upY2 = mainY;
      const udx = (upX2 - upX1) / 2;
      retryPaths += '<path d="M' + upX1 + ',' + upY1 + ' C' + (upX1 + udx) + ',' + upY1 + ' ' + (upX2 - udx) + ',' + upY2 + ' ' + upX2 + ',' + upY2 + '"' +
        ' stroke="#e05252" stroke-width="1.2" stroke-dasharray="5,3" fill="none" marker-end="url(#arrFail)"/>';
    }
  });

  // Node divs
  const nodeDivs = nodes.map(function(n) {
    const isOk = n.ok === undefined ? true : n.ok;
    const borderLeft = (n.ok === false) ? 'border-left:3px solid #e05252;' : '';
    const dotColor = isOk ? '#4cbb7f' : '#e05252';
    const dotAnim = isOk ? '' : 'animation:blink2 1s step-end infinite;';
    const statusDot = n.type === 'suite'
      ? '<div style="position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';' + dotAnim + 'flex-shrink:0"></div>'
      : '';
    return '<div title="' + esc(n.label) + ' — ' + esc(n.sublabel || '') + '" style="' +
      'position:absolute;left:' + n.x + 'px;top:' + n.y + 'px;width:' + nW + 'px;height:' + nH + 'px;' +
      'background:#fff;border:1px solid #e2e4e7;border-radius:8px;' + borderLeft +
      'box-shadow:0 2px 8px rgba(0,0,0,0.07);display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:3px;padding:6px;' +
      'font-family:-apple-system,system-ui,sans-serif;user-select:none;z-index:1;">' +
      statusDot +
      '<div style="width:38px;height:38px;border-radius:8px;background:' + n.color + '1a;' +
      'display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;">' + n.icon + '</div>' +
      '<div style="text-align:center;line-height:1.3;width:100%;padding:0 4px;">' +
      '<div style="font-size:9.5px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(n.label) + '</div>' +
      '<div style="font-size:8px;color:#6b7280;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(n.sublabel || '') + '</div>' +
      '</div>' +
      '<div style="position:absolute;left:-5px;top:50%;transform:translateY(-50%);width:9px;height:9px;border-radius:50%;background:' + n.color + ';border:2px solid #f4f4f5;z-index:2"></div>' +
      '<div style="position:absolute;right:-5px;top:50%;transform:translateY(-50%);width:9px;height:9px;border-radius:50%;background:' + n.color + ';border:2px solid #f4f4f5;z-index:2"></div>' +
      '</div>';
  }).join('');

  return '<div style="overflow-x:auto;border-radius:12px;border:1px solid #e2e4e7;box-shadow:0 2px 12px rgba(0,0,0,0.06);">' +
    '<div style="position:relative;width:' + totalW + 'px;height:' + canvasH + 'px;' +
    'background-color:#f4f4f5;' +
    'background-image:radial-gradient(circle,#d1d5db 1px,transparent 1px);' +
    'background-size:20px 20px;border-radius:12px;">' +
    '<svg style="position:absolute;top:0;left:0;width:' + totalW + 'px;height:' + canvasH + 'px;pointer-events:none;overflow:visible;" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#b0bec5"/></marker>' +
    '<marker id="arrFail" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#e05252"/></marker>' +
    '</defs>' +
    groupRects +
    paths +
    retryPaths +
    '</svg>' +
    nodeDivs +
    retryDivs +
    '</div></div>';
}

// ── Suite result cards ────────────────────────────────────────────────────
function suiteCards() {
  const suites = results.suites || [];
  if (suites.length === 0) {
    return '<p style="color:#64748b;text-align:center;padding:2rem 0;">No suite results — run test-runner.js first.</p>';
  }
  return suites.map(function(suite) {
    const m = SUITE_META[suite.id] || { icon: '▶', label: suite.name || 'Suite', color: '#64748b', dim: 'rgba(100,116,139,0.13)' };
    const pct = suite.total > 0 ? Math.round((suite.passed / suite.total) * 100) : 0;
    const retriedNote = (suite.retried || 0) > 0
      ? '<span style="font-size:10px;color:#f97316;margin-left:8px;">↻ ' + suite.retried + ' retried</span>'
      : '';
    const tests = (suite.tests || []).map(function(t) {
      const sym = t.passed ? '✅' : '❌';
      const retriedBadge = (t.retried && t.passed)
        ? '<span style="font-size:9px;color:#f97316;margin-left:5px;">↻' + (t.attempts || 1) + 'x</span>'
        : '';
      const failBadge = !t.passed
        ? '<span style="font-size:9px;color:#e05252;margin-left:5px;">×' + (t.attempts || 1) + '</span>'
        : '';
      return '<li style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);' +
        'font-size:12px;color:' + (t.passed ? '#cbd5e1' : '#f87171') + ';display:flex;align-items:center;gap:6px;">' +
        '<span style="flex-shrink:0">' + sym + '</span>' +
        '<span style="flex:1;">' + esc(t.name) + '</span>' +
        retriedBadge + failBadge + '</li>';
    }).join('');

    return '<div style="background:#12122a;border:1px solid rgba(255,255,255,0.07);' +
      'border-top:3px solid ' + m.color + ';border-radius:12px;padding:20px;' +
      'flex:1 1 340px;min-width:300px;max-width:520px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<div style="width:38px;height:38px;border-radius:9px;background:' + m.dim + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:20px;">' + m.icon + '</div>' +
      '<div><div style="font-weight:700;font-size:14px;color:#f1f5f9;">' + esc(m.label) + '</div>' +
      '<div style="font-size:10px;color:#64748b;">Suite ' + esc(suite.id) + '</div></div>' +
      '</div>' +
      '<div style="text-align:right;">' +
      '<div style="font-size:22px;font-weight:800;color:' + (pct === 100 ? '#4cbb7f' : pct >= 80 ? '#f0a030' : '#e05252') + ';">' + pct + '%</div>' +
      '<div style="font-size:10px;color:#64748b;">' + suite.passed + '/' + suite.total + ' passed' + retriedNote + '</div>' +
      '</div></div>' +
      '<div style="background:rgba(255,255,255,0.04);border-radius:6px;height:6px;margin-bottom:14px;overflow:hidden;">' +
      '<div style="height:100%;width:' + pct + '%;background:' + (pct === 100 ? '#4cbb7f' : pct >= 80 ? '#f0a030' : '#e05252') + ';border-radius:6px;"></div>' +
      '</div>' +
      '<ul style="list-style:none;margin:0;padding:0;max-height:260px;overflow-y:auto;">' + tests + '</ul>' +
      '</div>';
  }).join('');
}

function trendBar() {
  const p = results.passed || 0;
  const t = results.total || 0;
  const pct = t > 0 ? ((p / t) * 100).toFixed(1) : '0.0';
  let html = '<div style="display:flex;align-items:center;gap:12px;font-size:12px;color:#94a3b8;">' +
    '<span>Pass rate: <strong style="color:#f1f5f9;">' + pct + '%</strong></span>' +
    '<span>·</span>' +
    '<span>Run <strong style="color:#f1f5f9;">#' + (results.runNumber || 0) + '</strong></span>' +
    '<span>·</span>' +
    '<span>Duration: <strong style="color:#f1f5f9;">' + Math.round((results.duration || 0) / 1000) + 's</strong></span>';
  if ((results.retried || 0) > 0) {
    html += '<span>·</span><span>↻ <strong style="color:#f97316;">' + results.retried + ' retried</strong></span>';
  }
  html += '</div>';
  return html;
}

// ── Bug report section ────────────────────────────────────────────────────
function bugSection() {
  if (bugs.length === 0) return '';

  const high = bugs.filter(function(b) { return b.severity === 'high'; }).length;
  const med  = bugs.filter(function(b) { return b.severity === 'medium'; }).length;
  const low  = bugs.filter(function(b) { return b.severity === 'low'; }).length;

  const chips = [
    high > 0 ? '<span class="bug-chip" style="background:rgba(224,82,82,.12);color:#e05252">' + high + ' HIGH</span>' : '',
    med  > 0 ? '<span class="bug-chip" style="background:rgba(240,160,48,.12);color:#f0a030">' + med + ' MEDIUM</span>' : '',
    low  > 0 ? '<span class="bug-chip" style="background:rgba(77,184,212,.12);color:#4db8d4">' + low + ' LOW</span>' : '',
  ].filter(Boolean).join('');

  const cards = bugs.map(function(b) {
    const sc = b.severity === 'high' ? '#e05252' : b.severity === 'medium' ? '#f0a030' : '#4db8d4';
    const sb = b.severity === 'high' ? 'rgba(224,82,82,.12)' : b.severity === 'medium' ? 'rgba(240,160,48,.12)' : 'rgba(77,184,212,.12)';

    const stepsHtml = (b.steps || []).length > 0
      ? '<div class="bug-field"><div class="bug-fh">Steps to Reproduce</div>' +
        '<ol class="bug-steps-list">' + (b.steps || []).map(function(s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>'
      : '';

    const evidenceHtml = b.evidence
      ? '<div class="bug-field"><div class="bug-fh">Evidence</div><pre class="bug-evidence">' + esc(b.evidence) + '</pre></div>'
      : '';

    const pageLabel = (b.url || '').replace('https://dev.nerja.ai', '') || '/';

    return '<details class="bug-card">' +
      '<summary class="bug-summary">' +
      '<span class="bcarr">▶</span>' +
      '<span class="bug-sev" style="background:' + sb + ';color:' + sc + '">' + esc(b.severity) + '</span>' +
      '<span class="bug-id">' + esc(b.id) + '</span>' +
      '<span class="bug-title">' + esc(b.title) + '</span>' +
      '<span class="bug-cat">' + esc(b.category || '') + '</span>' +
      '<span class="bug-page">' + esc(pageLabel) + '</span>' +
      '</summary>' +
      '<div class="bug-detail">' +
      stepsHtml +
      '<div class="bug-grid">' +
      '<div class="bug-field"><div class="bug-fh">Observed</div><div class="bug-fv">' + esc(b.observed || '') + '</div></div>' +
      '<div class="bug-field"><div class="bug-fh">Expected</div><div class="bug-fv">' + esc(b.expected || '') + '</div></div>' +
      '</div>' +
      '<div class="bug-grid">' +
      '<div class="bug-field"><div class="bug-fh">Impact</div><div class="bug-fv">' + esc(b.impact || '') + '</div></div>' +
      '<div class="bug-field"><div class="bug-fh">Recommended Fix</div><div class="bug-fv bug-fix">' + esc(b.fix || '') + '</div></div>' +
      '</div>' +
      evidenceHtml +
      '</div>' +
      '</details>';
  }).join('');

  return '<div class="section bug-sec">' +
    '<div class="eyebrow">🐛 Bugs Found — ' + bugs.length + ' issue' + (bugs.length !== 1 ? 's' : '') + ' detected by browser automation</div>' +
    '<div class="bug-count-bar">' + chips + '</div>' +
    '<div class="bug-list">' + cards + '</div>' +
    '</div>\n\n';
}

// ── Main HTML ─────────────────────────────────────────────────────────────
function render() {
  const ts = new Date(results.timestamp || Date.now());
  const dateStr = ts.toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
  const allPass = results.failed === 0 && results.total > 0;
  const statusColor = allPass ? '#4cbb7f' : (results.total === 0 ? '#64748b' : '#e05252');
  const statusLabel = results.total === 0 ? 'NO DATA' : (allPass ? 'ALL PASSED' : results.failed + ' FAILED');

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Nerja AI — Test Suite Dashboard</title>\n' +
    '<style>\n' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\n' +
    ':root{--bg:#0a0a1a;--surface:#0f0f2a;--border:rgba(255,255,255,0.07);--text:#f1f5f9;--muted:#64748b}\n' +
    'body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;min-height:100vh;line-height:1.5}\n' +
    '@keyframes blink2{0%,100%{opacity:1}50%{opacity:0}}\n' +
    '@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}\n' +
    '.page{max-width:1400px;margin:0 auto;padding:32px 24px}\n' +
    '.header{display:flex;align-items:center;gap:14px;margin-bottom:36px;animation:fadeIn .5s ease}\n' +
    '.header-text h1{font-size:22px;font-weight:800;color:var(--text)}\n' +
    '.header-text p{font-size:12px;color:var(--muted);margin-top:2px}\n' +
    '.badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.5px;background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '50}\n' +
    '.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:36px}\n' +
    '.stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;animation:fadeIn .5s ease}\n' +
    '.stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}\n' +
    '.stat-value{font-size:28px;font-weight:800;line-height:1}\n' +
    '.section{margin-bottom:40px;animation:fadeIn .6s ease}\n' +
    '.section-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:8px}\n' +
    '.section-title::after{content:"";flex:1;height:1px;background:var(--border)}\n' +
    '.suite-grid{display:flex;flex-wrap:wrap;gap:20px}\n' +
    'footer{border-top:1px solid var(--border);padding-top:24px;margin-top:40px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;font-size:11px;color:var(--muted)}\n' +
    'footer a{color:#35F5C6;text-decoration:none}\n' +
    'footer a:hover{text-decoration:underline}\n' +
    '.eyebrow{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:16px;display:flex;align-items:center;gap:8px}\n' +
    '.eyebrow::after{content:"";flex:1;height:1px;background:var(--border)}\n' +
    '.bug-sec{padding:0 0 40px}\n' +
    '.bug-count-bar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}\n' +
    '.bug-chip{font-family:ui-monospace,monospace;font-size:10px;font-weight:700;padding:4px 10px;border-radius:4px;letter-spacing:.05em}\n' +
    '.bug-list{display:flex;flex-direction:column;gap:6px}\n' +
    'details.bug-card{background:#0f0f2a;border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden}\n' +
    'details.bug-card[open]{border-color:rgba(255,255,255,0.14)}\n' +
    'summary.bug-summary{display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;list-style:none;user-select:none}\n' +
    'summary.bug-summary::-webkit-details-marker{display:none}\n' +
    '.bcarr{font-size:9px;color:#64748b;transition:transform .2s;flex-shrink:0;margin-right:2px}\n' +
    'details.bug-card[open] .bcarr{transform:rotate(90deg)}\n' +
    '.bug-sev{font-family:ui-monospace,monospace;font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;flex-shrink:0;letter-spacing:.06em;text-transform:uppercase}\n' +
    '.bug-id{font-family:ui-monospace,monospace;font-size:9px;color:#64748b;flex-shrink:0}\n' +
    '.bug-title{font-size:13px;font-weight:600;flex:1;color:#f1f5f9}\n' +
    '.bug-cat{font-family:ui-monospace,monospace;font-size:9px;color:#64748b;flex-shrink:0;padding:1px 6px;border:1px solid rgba(255,255,255,0.07);border-radius:3px}\n' +
    '.bug-page{font-family:ui-monospace,monospace;font-size:9px;color:#35F5C6;flex-shrink:0;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n' +
    '.bug-detail{padding:4px 16px 16px;border-top:1px solid rgba(255,255,255,0.07)}\n' +
    '.bug-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}\n' +
    '@media(max-width:640px){.bug-grid{grid-template-columns:1fr}}\n' +
    '.bug-field{margin-top:12px}\n' +
    '.bug-fh{font-family:ui-monospace,monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin-bottom:5px}\n' +
    '.bug-fv{font-size:12px;color:rgba(232,230,240,.8);line-height:1.55}\n' +
    '.bug-fix{color:#35F5C6}\n' +
    '.bug-steps-list{font-size:12px;color:rgba(232,230,240,.8);padding-left:18px;line-height:1.75;margin:0}\n' +
    '.bug-evidence{font-family:ui-monospace,monospace;font-size:10.5px;background:#0c0c11;border:1px solid rgba(232,230,240,.06);border-radius:6px;padding:10px 14px;color:rgba(232,230,240,.55);white-space:pre-wrap;word-break:break-all;margin-top:4px;line-height:1.6;max-height:160px;overflow-y:auto}\n' +
    '</style>\n</head>\n<body>\n<div class="page">\n\n' +

    '<!-- Header -->\n' +
    '<div class="header">' +
    NERJA_LOGO_SVG +
    '<div class="header-text"><h1>Nerja AI — Test Suite Dashboard</h1>' +
    '<p>Last run: ' + esc(dateStr) + '</p></div>' +
    '<div style="margin-left:auto;display:flex;align-items:center;gap:12px;">' +
    '<span class="badge"><span style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>' +
    esc(statusLabel) + '</span></div></div>\n\n' +

    '<!-- Stats -->\n' +
    '<div class="stats-grid">' +
    '<div class="stat"><div class="stat-label">Total Tests</div><div class="stat-value" style="color:#f1f5f9;">' + (results.total || 0) + '</div></div>' +
    '<div class="stat"><div class="stat-label">Passed</div><div class="stat-value" style="color:#4cbb7f;">' + (results.passed || 0) + '</div></div>' +
    '<div class="stat"><div class="stat-label">Failed</div><div class="stat-value" style="color:' + ((results.failed || 0) > 0 ? '#e05252' : '#4cbb7f') + ';">' + (results.failed || 0) + '</div></div>' +
    '<div class="stat"><div class="stat-label">Suites</div><div class="stat-value" style="color:#4db8d4;">' + (results.suites || []).length + '</div></div>' +
    '<div class="stat"><div class="stat-label">Duration</div><div class="stat-value" style="color:#f0a030;font-size:22px;">' + Math.round((results.duration || 0) / 1000) + 's</div></div>' +
    ((results.retried || 0) > 0 ? '<div class="stat"><div class="stat-label">Retried</div><div class="stat-value" style="color:#f97316;">' + results.retried + '</div></div>' : '') +
    '</div>\n\n' +

    '<!-- N8N Workflow Canvas -->\n' +
    '<div class="section"><div class="section-title">Workflow</div>' +
    '<div style="font-size:10px;color:#64748b;margin-bottom:6px;text-align:right;">← Scroll horizontally to see full workflow →</div>' +
    n8nCanvas() +
    '</div>\n\n' +

    '<!-- Run Info -->\n' +
    '<div class="section" style="margin-bottom:28px;"><div class="section-title">Run Info</div>' +
    trendBar() + '</div>\n\n' +

    '<!-- Suite Result Cards -->\n' +
    '<div class="section"><div class="section-title">Suite Results</div>' +
    '<div class="suite-grid">' + suiteCards() + '</div></div>\n\n' +

    '<!-- Bug Report Section -->\n' +
    bugSection() +

    '<!-- Footer -->\n' +
    '<footer>' +
    '<div>Built by <a href="https://www.linkedin.com/in/mejbaur/" target="_blank" rel="noopener">Mejbaur Bahar Fagun</a> — Senior Software Engineer, QA (L4)</div>' +
    '<div style="display:flex;align-items:center;gap:8px;">' + NERJA_LOGO_SVG +
    '<span>Nerja AI Automation · Node.js · no external deps · real HTTP results only</span></div>' +
    '</footer>\n\n</div>\n</body>\n</html>';

  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/index.html', html);
  const kb = Math.round(html.length / 1024);
  console.log('Report written → docs/index.html (' + kb + ' KB, ' + (results.suites || []).length + ' suites, ' + (results.total || 0) + ' tests)');
}

render();
