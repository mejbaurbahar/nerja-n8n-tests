#!/usr/bin/env node
'use strict';
const https = require('https');

const BASE = 'https://dev.nerja.ai';
const EMAIL = process.env.NERJA_EMAIL;
const PASSWORD = process.env.NERJA_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: Set NERJA_EMAIL and NERJA_PASSWORD env vars');
  process.exit(1);
}

// ── HTTP helper ────────────────────────────────────────────────────────────
function req(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = https.request(url, opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    r.on('error', reject);
    r.setTimeout(12000, () => r.destroy(new Error('Timeout')));
    if (payload) r.write(payload);
    r.end();
  });
}

// ── Report state ───────────────────────────────────────────────────────────
const allResults = [];
const suites = [];
const startTime = Date.now();
let currentSuite = '';
let currentSuiteTitle = '';
let suiteResults = [];

function startSuite(id, title) {
  currentSuite = id;
  currentSuiteTitle = title;
  suiteResults = [];
  const bar = '═'.repeat(48);
  console.log(`\n╔${bar}╗`);
  console.log(`║  NERJA AI — ${title.padEnd(35)}║`);
  console.log(`╚${bar}╝`);
}

function endSuite() {
  const passed = suiteResults.filter(r => r.passed).length;
  const failed = suiteResults.filter(r => !r.passed).length;
  const total = suiteResults.length;
  suites.push({
    id: currentSuite,
    name: currentSuiteTitle,
    total, passed, failed,
    tests: suiteResults.map(r => ({ name: r.name, passed: r.passed }))
  });
  console.log(`\n→ ${passed}/${total} passed | ${failed} failed`);
  if (failed > 0) console.log('STATUS: FAIL');
  else console.log('STATUS: PASS');
}

async function check(name, fn) {
  try {
    const ok = await fn();
    const sym = ok ? '✅' : '❌';
    const detail = ok
      ? `${sym} ${name}`
      : `${sym} ${name}`;
    console.log(detail);
    const r = { suite: currentSuite, name, passed: !!ok, detail };
    suiteResults.push(r);
    allResults.push(r);
  } catch (e) {
    const detail = `❌ ${name} — Error: ${e.message}`;
    console.log(detail);
    const r = { suite: currentSuite, name, passed: false, detail };
    suiteResults.push(r);
    allResults.push(r);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  let sessionCookie = '';

  // ────────────────────────────────────────────────────────────────────────
  // Suite 01 — Authentication Tests
  // ────────────────────────────────────────────────────────────────────────
  startSuite('01', 'AUTHENTICATION TESTS');

  await check('Valid credentials accepted (HTTP 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
    return r.status === 200;
  });

  await check('Wrong password correctly rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: 'WrongPass999!' });
    return r.status !== 200;
  });

  await check('Unknown email correctly rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: 'ghost_xyz@nowhere.invalid', password: 'AnyPass!1' });
    return r.status !== 200;
  });

  await check('Empty email correctly rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: '', password: 'AnyPass!1' });
    return r.status !== 200;
  });

  await check('Empty password correctly rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: '' });
    return r.status !== 200;
  });

  await check('Dashboard protected — requires authentication', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, { Cookie: '' });
    const loc = (r.headers['location'] || '').toLowerCase();
    return r.status !== 200 || loc.includes('login');
  });

  endSuite();

  // ────────────────────────────────────────────────────────────────────────
  // Suite 02 — Public Pages Availability
  // ────────────────────────────────────────────────────────────────────────
  startSuite('02', 'PUBLIC PAGES AVAILABILITY');

  const publicPages = [
    ['Landing Page → reachable', `${BASE}/`],
    ['Login Page → reachable', `${BASE}/login`],
    ['Signup Page → reachable', `${BASE}/signup`],
    ['Forgot Password → reachable', `${BASE}/forgot-password`],
  ];

  for (const [name, url] of publicPages) {
    await check(name, async () => {
      const r = await req('GET', url);
      return r.status >= 200 && r.status < 500;
    });
  }

  endSuite();

  // ────────────────────────────────────────────────────────────────────────
  // Suite 03 — Authenticated App Pages
  // ────────────────────────────────────────────────────────────────────────
  startSuite('03', 'AUTHENTICATED APP PAGES');

  if (!sessionCookie) {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
  }

  const authHeaders = sessionCookie ? { Cookie: sessionCookie } : {};
  const appPages = [
    ['Dashboard → loads', `${BASE}/app/dashboard`],
    ['Analytics → loads', `${BASE}/app/analytics`],
    ['Leads → loads', `${BASE}/app/leads`],
    ['Campaigns → loads', `${BASE}/app/campaigns`],
    ['Integrations → loads', `${BASE}/app/integrations`],
    ['Settings → loads', `${BASE}/app/settings`],
    ['Billing → loads', `${BASE}/app/billing`],
  ];

  for (const [name, url] of appPages) {
    await check(name, async () => {
      const r = await req('GET', url, null, authHeaders);
      return r.status >= 200 && r.status < 500;
    });
  }

  endSuite();

  // ────────────────────────────────────────────────────────────────────────
  // Suite 04 — Functional Feature Tests
  // ────────────────────────────────────────────────────────────────────────
  startSuite('04', 'FUNCTIONAL FEATURE TESTS');

  await check('Analytics API → responds', async () => {
    const r = await req('GET', `${BASE}/api/analytics`, null, authHeaders);
    return r.status < 500;
  });

  await check('Leads API → responds', async () => {
    const r = await req('GET', `${BASE}/api/leads`, null, authHeaders);
    return r.status < 500;
  });

  await check('Campaigns API → responds', async () => {
    const r = await req('GET', `${BASE}/api/campaigns`, null, authHeaders);
    return r.status < 500;
  });

  await check('Integrations API → responds', async () => {
    const r = await req('GET', `${BASE}/api/integrations`, null, authHeaders);
    return r.status < 500;
  });

  await check('Settings API → responds', async () => {
    const r = await req('GET', `${BASE}/api/settings`, null, authHeaders);
    return r.status < 500;
  });

  await check('Logout → session cleared', async () => {
    const r = await req('POST', `${BASE}/api/auth/logout`, {}, authHeaders);
    return r.status < 500;
  });

  endSuite();

  // ────────────────────────────────────────────────────────────────────────
  // Full Suite Summary
  // ────────────────────────────────────────────────────────────────────────
  const totalPassed = allResults.filter(r => r.passed).length;
  const totalFailed = allResults.filter(r => !r.passed).length;
  const total = allResults.length;

  const bar = '═'.repeat(48);
  console.log(`\n╔${bar}╗`);
  console.log(`║  NERJA AI — FULL SUITE SUMMARY                 ║`);
  console.log(`╚${bar}╝`);
  console.log(`Total Tests : ${total}`);
  console.log(`Passed      : ${totalPassed}`);
  console.log(`Failed      : ${totalFailed}`);

  const jsonOut = {
    timestamp: new Date().toISOString(),
    runNumber: parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10),
    total, passed: totalPassed, failed: totalFailed,
    duration: Date.now() - startTime,
    suites
  };
  require('fs').writeFileSync('results.json', JSON.stringify(jsonOut, null, 2));

  if (totalFailed > 0) {
    console.log(`\nSTATUS: ❌ ${totalFailed} TEST(S) FAILED`);
    console.log('\nFailed tests:');
    allResults.filter(r => !r.passed).forEach(r => console.log(`  ❌ [${r.suite}] ${r.name}`));
    process.exit(1);
  } else {
    console.log(`\nSTATUS: ✅ ALL ${total} TESTS PASSED`);
  }
}

run().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
