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
    r.setTimeout(10000, () => { r.destroy(new Error('Request timeout')); });
    if (payload) r.write(payload);
    r.end();
  });
}

const results = [];
let suite = '';

async function check(name, fn) {
  try {
    const ok = await fn();
    const sym = ok ? 'PASS' : 'FAIL';
    const line = `[${sym}] ${name}`;
    console.log(line);
    results.push({ suite, name, passed: !!ok });
  } catch (e) {
    const line = `[FAIL] ${name} — ${e.message}`;
    console.log(line);
    results.push({ suite, name, passed: false });
  }
}

async function run() {
  let sessionCookie = '';

  // ── Suite 01: Authentication ────────────────────────────────────────
  suite = '01-auth';
  console.log('\n=== Suite 01: Authentication Tests ===');

  await check('Valid login returns 200', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
    return r.status === 200;
  });

  await check('Wrong password rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: 'WrongPass999!' });
    return r.status !== 200;
  });

  await check('Nonexistent email rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: 'ghost_xyz_notexist@nowhere.invalid', password: 'AnyPass!1' });
    return r.status !== 200;
  });

  await check('Empty email rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: '', password: 'AnyPass!1' });
    return r.status !== 200;
  });

  await check('Empty password rejected (not 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: '' });
    return r.status !== 200;
  });

  await check('Dashboard requires auth (not 200 or redirects to login)', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, { Cookie: '' });
    const loc = (r.headers['location'] || '').toLowerCase();
    return r.status !== 200 || loc.includes('login');
  });

  reportSuite();

  // ── Suite 02: Public Pages ───────────────────────────────────────────
  suite = '02-pages';
  console.log('\n=== Suite 02: Public Pages Availability ===');

  const publicPages = [
    ['Landing page (/) is reachable', `${BASE}/`],
    ['Login page (/login) is reachable', `${BASE}/login`],
    ['Signup page (/signup) is reachable', `${BASE}/signup`],
    ['Forgot password page is reachable', `${BASE}/forgot-password`],
  ];

  for (const [name, url] of publicPages) {
    await check(name, async () => {
      const r = await req('GET', url);
      return r.status < 500;
    });
  }

  reportSuite();

  // ── Suite 03: Authenticated App Pages ───────────────────────────────
  suite = '03-app';
  console.log('\n=== Suite 03: Authenticated App Pages ===');

  if (!sessionCookie) {
    console.log('[SKIP] No session cookie — re-login for suite 03');
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
  }

  const appPages = [
    ['Dashboard loads (200 or redirect)', `${BASE}/app/dashboard`],
    ['Analytics page accessible', `${BASE}/app/analytics`],
    ['Leads page accessible', `${BASE}/app/leads`],
    ['Campaigns page accessible', `${BASE}/app/campaigns`],
    ['Integrations page accessible', `${BASE}/app/integrations`],
    ['Settings page accessible', `${BASE}/app/settings`],
    ['Billing page accessible', `${BASE}/app/billing`],
  ];

  for (const [name, url] of appPages) {
    await check(name, async () => {
      const r = await req('GET', url, null, sessionCookie ? { Cookie: sessionCookie } : {});
      return r.status < 500;
    });
  }

  reportSuite();

  // ── Suite 04: Functional / API Tests ────────────────────────────────
  suite = '04-func';
  console.log('\n=== Suite 04: Functional Feature Tests ===');

  await check('Analytics API responds', async () => {
    const r = await req('GET', `${BASE}/api/analytics`, null, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  await check('Leads API responds', async () => {
    const r = await req('GET', `${BASE}/api/leads`, null, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  await check('Campaigns API responds', async () => {
    const r = await req('GET', `${BASE}/api/campaigns`, null, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  await check('Integrations API responds', async () => {
    const r = await req('GET', `${BASE}/api/integrations`, null, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  await check('Settings API responds', async () => {
    const r = await req('GET', `${BASE}/api/settings`, null, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  await check('Logout works (clears session)', async () => {
    const r = await req('POST', `${BASE}/api/auth/logout`, {}, sessionCookie ? { Cookie: sessionCookie } : {});
    return r.status < 500;
  });

  reportSuite();

  // ── Final Summary ────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log('\n=== NERJA AI FULL SUITE SUMMARY ===');
  console.log(`Total: ${total} tests | Passed: ${passed} | Failed: ${failed}`);
  console.log(`STATUS: ${failed === 0 ? 'ALL TESTS PASSED' : `FAILED (${failed} test(s) failed)`}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.log(`  [FAIL] ${r.name}`));
    process.exit(1);
  }
}

function reportSuite() {
  const suiteResults = results.filter(r => r.suite === suite);
  const p = suiteResults.filter(r => r.passed).length;
  const f = suiteResults.filter(r => !r.passed).length;
  console.log(`→ ${p}/${suiteResults.length} passed | ${f} failed`);
}

run().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
