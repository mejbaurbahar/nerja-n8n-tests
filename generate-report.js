#!/usr/bin/env node
'use strict';
const fs = require('fs');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dur(ms) {
  if (!ms || ms < 1000) return `${ms || 0}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

let results;
try {
  results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
} catch (_) {
  results = { timestamp: new Date().toISOString(), runNumber: 0, total: 0, passed: 0, failed: 0, duration: 0, suites: [] };
}

const aiText = (() => { try { return fs.readFileSync('ai-analysis.txt', 'utf8').trim(); } catch (_) { return ''; } })();

const allPass = results.failed === 0 && results.total > 0;
const runDate = (() => {
  const d = new Date(results.timestamp);
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
})();

const SUITE_META = {
  '01': { icon: '🔐', label: 'Auth Tests',    color: '#9b6dff', dim: 'rgba(155,109,255,0.13)' },
  '02': { icon: '🌐', label: 'Public Pages',  color: '#4db8d4', dim: 'rgba(77,184,212,0.13)'  },
  '03': { icon: '🖥',  label: 'App Pages',     color: '#4cbb7f', dim: 'rgba(76,187,127,0.13)'  },
  '04': { icon: '⚙',  label: 'Functional',    color: '#f0a030', dim: 'rgba(240,160,48,0.13)'  },
};

function workflowNodes() {
  const pass = '#4cbb7f', fail = '#e05252';
  const parts = [];

  parts.push(`
    <div class="wf-node wf-trigger">
      <div class="node-body">
        <div class="node-icon-wrap" style="background:rgba(255,112,67,.14)">◎</div>
        <div class="node-text">
          <div class="node-type">TRIGGER</div>
          <div class="node-name">Schedule · Dispatch</div>
        </div>
      </div>
      <div class="node-handle nd-out" style="background:#ff7043"></div>
    </div>`);

  results.suites.forEach(suite => {
    const m = SUITE_META[suite.id] || { icon: '▶', label: suite.name, color: '#64748b', dim: 'rgba(100,116,139,0.12)' };
    const ok = suite.failed === 0;
    const sc = ok ? pass : fail;

    parts.push(`
    <div class="wf-connector">
      <div class="conn-line"><div class="conn-pulse"></div></div>
      <div class="conn-arr">▸</div>
    </div>`);

    parts.push(`
    <div class="wf-node wf-suite" style="--sc:${m.color}">
      <div class="node-handle nd-in"  style="background:${m.color}"></div>
      <div class="node-body">
        <div class="node-icon-wrap" style="background:${m.dim}">${m.icon}</div>
        <div class="node-text">
          <div class="node-type" style="color:${m.color}">SUITE ${esc(suite.id)}</div>
          <div class="node-name">${esc(m.label)}</div>
        </div>
      </div>
      <div class="node-badge" style="background:${ok ? 'rgba(76,187,127,.14)' : 'rgba(224,82,82,.14)'};color:${sc};border-color:${sc}55">
        ${suite.passed}/${suite.total}
      </div>
      <div class="node-handle nd-out" style="background:${m.color}"></div>
    </div>`);
  });

  const sc = allPass ? pass : fail;
  const sbg = allPass ? 'rgba(76,187,127,.14)' : 'rgba(224,82,82,.14)';

  parts.push(`
    <div class="wf-connector">
      <div class="conn-line"><div class="conn-pulse"></div></div>
      <div class="conn-arr">▸</div>
    </div>
    <div class="wf-node wf-summary" style="border-color:${sc}44">
      <div class="node-handle nd-in" style="background:${sc}"></div>
      <div class="node-body">
        <div class="node-icon-wrap" style="background:${sbg}">${allPass ? '✓' : '✗'}</div>
        <div class="node-text">
          <div class="node-type" style="color:${sc}">${allPass ? 'ALL PASS' : 'FAILURES'}</div>
          <div class="node-name">${results.passed}/${results.total} tests</div>
        </div>
      </div>
    </div>`);

  return parts.join('');
}

function suiteCards() {
  return results.suites.map(suite => {
    const m = SUITE_META[suite.id] || { icon: '▶', label: suite.name, color: '#64748b', dim: 'rgba(100,116,139,0.12)' };
    const ok = suite.failed === 0;
    const sc = ok ? '#4cbb7f' : '#e05252';
    const pct = suite.total > 0 ? Math.round(suite.passed / suite.total * 100) : 0;

    const rows = suite.tests.map(t => `
      <div class="test-row ${t.passed ? 'tp' : 'tf'}">
        <span class="tdot" style="background:${t.passed ? '#4cbb7f' : '#e05252'}"></span>
        <span class="tname">${esc(t.name)}</span>
        <span class="tstatus">${t.passed ? 'PASS' : 'FAIL'}</span>
      </div>`).join('');

    return `
    <div class="suite-card" style="--c:${m.color};--cdim:${m.dim};border-top-color:${m.color}">
      <div class="card-top" style="border-bottom-color:${m.color}22">
        <span class="card-id" style="color:${m.color}">${m.icon}&nbsp;SUITE ${esc(suite.id)}</span>
        <span class="card-badge" style="background:${ok ? 'rgba(76,187,127,.12)' : 'rgba(224,82,82,.12)'};color:${sc}">${ok ? 'PASS' : 'FAIL'}</span>
      </div>
      <div class="card-name">${esc(m.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${sc}"></div></div>
      <div class="test-list">${rows}</div>
      <div class="card-foot">
        <span style="color:${m.color}">${suite.passed}/${suite.total} passed</span>
        ${suite.failed > 0 ? `<span style="color:#e05252">${suite.failed} failed</span>` : '<span style="color:#4cbb7f">all clear</span>'}
      </div>
    </div>`;
  }).join('');
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nerja AI — Quality Monitor</title>
<style>
:root{
  --ground:#131319;
  --canvas:#1a1a24;
  --text:#e8e6f0;
  --muted:#8b8999;
  --accent:#ff7043;
  --v:#9b6dff;
  --pass:#4cbb7f;
  --fail:#e05252;
  --border:rgba(232,230,240,.08);
  --mono:ui-monospace,'Cascadia Code','Fira Code',monospace;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--ground);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;min-height:100vh}
a{color:var(--v);text-decoration:none}
a:hover{text-decoration:underline}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important}}

/* ── Header ── */
.hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;
  padding:14px 32px;background:var(--canvas);border-bottom:1px solid var(--border)}
.hdr-l{display:flex;align-items:center;gap:12px}
.logobug{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--v));
  display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:13px;
  font-weight:800;color:#fff;letter-spacing:-1.5px;flex-shrink:0}
.logo-t{font-family:var(--mono);font-size:13px;font-weight:700;letter-spacing:.02em}
.logo-s{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase}
.hdr-m{font-family:var(--mono);font-size:11px;color:var(--muted);text-align:right}
.hdr-m span{color:var(--accent)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:20px;
  font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid}
.pill.pass{background:rgba(76,187,127,.09);color:var(--pass);border-color:rgba(76,187,127,.28)}
.pill.fail{background:rgba(224,82,82,.09);color:var(--fail);border-color:rgba(224,82,82,.28)}
.pdot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:blink 2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}

/* ── Stats strip ── */
.stats{display:flex;flex-wrap:wrap;padding:0 32px;background:var(--canvas);border-bottom:1px solid var(--border)}
.stat{display:flex;align-items:center;gap:10px;padding:12px 28px 12px 0;margin-right:28px;border-right:1px solid var(--border)}
.stat:last-child{border-right:none}
.sn{font-family:var(--mono);font-size:28px;font-weight:700;line-height:1;letter-spacing:-1.5px}
.sl{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);line-height:1.35}
.sn.tot{color:var(--text)}
.sn.pas{color:var(--pass)}
.sn.fai{color:var(--fail)}
.sn.tim{color:var(--accent);font-size:20px}

/* ── Canvas section ── */
.csec{padding:44px 32px}
.eyebrow{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);
  margin-bottom:20px;display:flex;align-items:center;gap:10px}
.eyebrow::after{content:'';flex:1;height:1px;background:var(--border)}
.canvas-wrap{
  background-image:radial-gradient(circle,rgba(232,230,240,.055) 1px,transparent 1px);
  background-size:22px 22px;
  border:1px solid var(--border);border-radius:12px;padding:40px 28px;overflow-x:auto}
.wf-row{display:flex;align-items:center;min-width:max-content}

/* ── Nodes ── */
.wf-node{position:relative;display:flex;flex-direction:column;width:148px;
  background:var(--canvas);border:1px solid var(--border);border-radius:8px;
  flex-shrink:0;transition:transform .15s,box-shadow .15s}
.wf-node:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.wf-trigger{border-color:rgba(255,112,67,.3)}
.wf-suite{border-left:3px solid var(--sc,#555)}
.node-handle{position:absolute;width:10px;height:10px;border-radius:50%;top:50%;transform:translateY(-50%);
  border:2px solid var(--ground);z-index:1}
.nd-in{left:-5px}
.nd-out{right:-5px}
.node-body{display:flex;align-items:center;gap:9px;padding:12px 12px 10px}
.node-icon-wrap{width:32px;height:32px;border-radius:6px;display:flex;align-items:center;
  justify-content:center;flex-shrink:0;font-size:16px;font-family:var(--mono);font-weight:700;color:var(--text)}
.node-text{flex:1;min-width:0}
.node-type{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.node-name{font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.node-badge{margin:0 10px 10px;padding:3px 8px;border-radius:4px;font-family:var(--mono);
  font-size:11px;font-weight:700;text-align:center;border:1px solid transparent}
.wf-summary .node-icon-wrap{font-family:var(--mono);font-size:18px;font-weight:900}

/* ── Connectors ── */
.wf-connector{display:flex;align-items:center;width:44px;flex-shrink:0}
.conn-line{flex:1;height:2px;background:rgba(255,112,67,.22);position:relative;overflow:hidden}
.conn-pulse{position:absolute;top:0;left:-40%;width:40%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,112,67,.9),transparent);
  animation:fpulse 2s ease-in-out infinite}
@keyframes fpulse{from{left:-40%}to{left:110%}}
.conn-arr{font-size:14px;color:var(--accent);opacity:.65;flex-shrink:0;line-height:1}

/* ── Suite cards ── */
.ssec{padding:0 32px 48px}
.suite-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.suite-card{background:var(--canvas);border:1px solid var(--border);border-top:3px solid;border-radius:8px;
  overflow:hidden;transition:box-shadow .15s}
.suite-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.35)}
.card-top{display:flex;align-items:center;justify-content:space-between;padding:13px 15px 10px;border-bottom:1px solid}
.card-id{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em}
.card-badge{font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.08em;padding:2px 8px;border-radius:3px}
.card-name{padding:10px 15px 8px;font-size:13px;font-weight:600;color:var(--text)}
.bar-track{margin:0 15px 12px;height:3px;background:rgba(255,255,255,.05);border-radius:2px;overflow:hidden}
.bar-fill{height:100%;border-radius:2px}
.test-list{padding:0 15px;display:flex;flex-direction:column;gap:1px}
.test-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03)}
.test-row:last-child{border-bottom:none}
.tdot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
.tname{flex:1;font-size:11.5px;color:rgba(232,230,240,.72)}
.tf .tname{color:rgba(224,82,82,.9)}
.tstatus{font-family:var(--mono);font-size:8.5px;font-weight:700;letter-spacing:.06em;flex-shrink:0}
.tp .tstatus{color:var(--pass);opacity:.65}
.tf .tstatus{color:var(--fail)}
.card-foot{display:flex;justify-content:space-between;padding:10px 15px 13px;
  font-family:var(--mono);font-size:10px;border-top:1px solid var(--border);margin-top:6px}

/* ── AI terminal ── */
.aisec{padding:0 32px 48px}
.ai-box{background:#0c0c11;border:1px solid rgba(155,109,255,.22);border-radius:8px;overflow:hidden}
.ai-bar{background:rgba(155,109,255,.09);padding:8px 16px;display:flex;align-items:center;gap:7px;
  border-bottom:1px solid rgba(155,109,255,.15)}
.tdot2{width:8px;height:8px;border-radius:50%}
.ai-lbl{font-family:var(--mono);font-size:10px;color:rgba(155,109,255,.8);letter-spacing:.05em;margin-left:4px}
.ai-body{padding:20px 24px;font-family:var(--mono);font-size:12px;line-height:1.75;
  color:rgba(232,230,240,.72);white-space:pre-wrap;word-break:break-word}
.ai-cur{display:inline-block;width:7px;height:13px;background:var(--v);margin-left:2px;
  vertical-align:text-bottom;animation:cblink 1s step-end infinite}
@keyframes cblink{0%,100%{opacity:1}50%{opacity:0}}

/* ── Footer ── */
.ftr{padding:18px 32px;border-top:1px solid var(--border);display:flex;align-items:center;
  justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--canvas)}
.ftxt{font-family:var(--mono);font-size:10px;color:var(--muted)}
.fa{color:var(--accent)}
.fv{color:var(--v)}
.fsep{color:var(--border);margin:0 6px}

@media(max-width:640px){
  .hdr,.stats,.csec,.ssec,.aisec,.ftr{padding-left:16px;padding-right:16px}
  .sn{font-size:20px}.sn.tim{font-size:16px}
  .stat{padding-right:16px;margin-right:16px}
}
</style>
</head>
<body>

<header class="hdr">
  <div class="hdr-l">
    <div class="logobug">N↯</div>
    <div>
      <div class="logo-t">Nerja AI</div>
      <div class="logo-s">Quality Monitor</div>
    </div>
  </div>
  <div class="hdr-m">
    <div>Run <span>#${results.runNumber || '–'}</span> &nbsp;·&nbsp; ${runDate}</div>
    <div>dev.nerja.ai</div>
  </div>
  <div class="pill ${allPass ? 'pass' : 'fail'}">
    <span class="pdot"></span>
    ${allPass ? 'All tests pass' : `${results.failed} test${results.failed !== 1 ? 's' : ''} failed`}
  </div>
</header>

<div class="stats">
  <div class="stat"><div class="sn tot">${results.total}</div><div class="sl">Total<br>tests</div></div>
  <div class="stat"><div class="sn pas">${results.passed}</div><div class="sl">Tests<br>passed</div></div>
  <div class="stat"><div class="sn fai">${results.failed}</div><div class="sl">Tests<br>failed</div></div>
  <div class="stat"><div class="sn tim">${dur(results.duration)}</div><div class="sl">Run<br>time</div></div>
</div>

<section class="csec">
  <div class="eyebrow">Workflow</div>
  <div class="canvas-wrap">
    <div class="wf-row">${workflowNodes()}</div>
  </div>
</section>

<section class="ssec">
  <div class="eyebrow">Test suites</div>
  <div class="suite-grid">${suiteCards()}</div>
</section>

${aiText ? `
<section class="aisec">
  <div class="eyebrow">AI analysis — Qwen 2.5 0.5B · Ollama</div>
  <div class="ai-box">
    <div class="ai-bar">
      <span class="tdot2" style="background:#e05252"></span>
      <span class="tdot2" style="background:#f0a030"></span>
      <span class="tdot2" style="background:#4cbb7f"></span>
      <span class="ai-lbl">ollama run qwen2.5:0.5b — analysis complete</span>
    </div>
    <div class="ai-body">${esc(aiText)}<span class="ai-cur"></span></div>
  </div>
</section>` : ''}

<footer class="ftr">
  <div class="ftxt">
    Generated <span class="fa">${runDate}</span>
    <span class="fsep">·</span>
    Run <span class="fa">#${results.runNumber || '–'}</span>
    <span class="fsep">·</span>
    <a href="https://github.com/mejbaurbahar/nerja-n8n-tests" class="fv">github/mejbaurbahar/nerja-n8n-tests</a>
  </div>
  <div class="ftxt">GitHub Actions CI&nbsp;<span class="fsep">·</span>&nbsp;Ollama Qwen 2.5 0.5B&nbsp;<span class="fsep">·</span>&nbsp;Node.js</div>
</footer>

</body>
</html>`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', html);
console.log('Report → docs/index.html');
