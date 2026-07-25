#!/usr/bin/env node
'use strict';
const https = require('https');
const http = require('http');

const BASE = 'https://dev.nerja.ai';
const EMAIL = process.env.NERJA_EMAIL;
const PASSWORD = process.env.NERJA_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: Set NERJA_EMAIL and NERJA_PASSWORD env vars');
  process.exit(1);
}

const OLLAMA_ALLOWED_PATHS = new Set([
  '/', '/login', '/signup', '/forgot-password', '/pricing',
  '/signup?plan=growth', '/signup?plan=pro',
  '/app/dashboard', '/app/analytics', '/app/leads', '/app/campaigns',
  '/app/campaigns/create-a-new-campaign', '/app/integrations',
  '/app/data-room', '/app/data-room/knowledge-base',
  '/app/settings', '/app/plan-and-billing',
  '/api/auth/login', '/api/auth/logout', '/api/auth/register',
]);

// ── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function req(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = lib.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let parsed2;
        try { parsed2 = JSON.parse(raw); } catch { parsed2 = raw; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed2, location: res.headers['location'] || '' });
      });
    });
    r.on('error', reject);
    r.setTimeout(15000, () => r.destroy(new Error('Timeout')));
    if (payload) r.write(payload);
    r.end();
  });
}

// Ollama streaming NDJSON generator
function ollamaGenerate(model, prompt, timeoutMs) {
  return new Promise((resolve, reject) => {
    // think:false disables reasoning mode on qwen3 — much faster response
    const body = JSON.stringify({ model, prompt, stream: true, think: false, options: { num_predict: 512 } });
    const opts = {
      method: 'POST',
      hostname: 'localhost',
      port: 11434,
      path: '/api/generate',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const r = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let fullText = '';
        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.response) fullText += obj.response;
            if (obj.done) break;
          } catch { /* skip malformed */ }
        }
        resolve(fullText);
      });
    });
    r.on('error', reject);
    r.setTimeout(timeoutMs, () => r.destroy(new Error('Ollama timeout')));
    r.write(body);
    r.end();
  });
}

async function getLocalOllamaModel() {
  return new Promise(resolve => {
    const r = http.request({ method: 'GET', hostname: 'localhost', port: 11434, path: '/api/tags' }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const local = (data.models || []).map(m => m.name).filter(m => !m.includes(':cloud'));
          resolve(local[0] || null);
        } catch { resolve(null); }
      });
    });
    r.on('error', () => resolve(null));
    r.setTimeout(3000, () => { r.destroy(); resolve(null); });
    r.end();
  });
}

async function generateAITests() {
  const model = await getLocalOllamaModel();
  if (!model) {
    console.log('ℹ️  Ollama not running or no local models — skipping AI test generation (Suite 08)');
    return null;
  }

  console.log('🤖 Ollama available — generating AI test cases with ' + model + '...');

  const prompt = `You are a QA engineer testing the Nerja AI web app at https://dev.nerja.ai.
Generate exactly 8 diverse HTTP test cases covering: auth edge cases, public page variants, protected page access, API validation, boundary conditions, and error scenarios.

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just the raw JSON array.

Format (each object must have all fields):
[{"name":"descriptive test name","method":"GET","path":"/","auth":false,"body":null,"expectStatusMin":200,"expectStatusMax":499}]

STRICT RULES — violating these means the test will be discarded:
- method: must be exactly "GET" or "POST"
- path: must be EXACTLY one of these values (copy exactly, no variations):
  /, /login, /signup, /forgot-password, /pricing, /signup?plan=growth, /signup?plan=pro,
  /app/dashboard, /app/analytics, /app/leads, /app/campaigns,
  /app/campaigns/create-a-new-campaign, /app/integrations,
  /app/data-room, /app/data-room/knowledge-base,
  /app/settings, /app/plan-and-billing,
  /api/auth/login, /api/auth/logout, /api/auth/register
- auth: true for /app/* routes (require session), false for public routes
- body: null or a JSON object for POST requests
- expectStatusMin: minimum acceptable HTTP status code (integer)
- expectStatusMax: maximum acceptable HTTP status code (integer)

Generate 8 test cases now:`;

  let rawResponse = '';
  try {
    rawResponse = await ollamaGenerate(model, prompt, 180000);
  } catch (e) {
    console.log(`ℹ️  Ollama generation failed: ${e.message} — skipping Suite 08`);
    return null;
  }

  // Extract JSON arrays — model may return multiple arrays on separate lines
  let testSpecs = [];
  try {
    const matches = [...rawResponse.matchAll(/\[[\s\S]*?\]/g)];
    if (matches.length === 0) throw new Error('No JSON array in response');
    for (const m of matches) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) testSpecs.push(...parsed);
      } catch { /* skip malformed chunk */ }
    }
    if (testSpecs.length === 0) throw new Error('No valid items parsed from response');
  } catch (e) {
    console.log(`⚠️  AI response parse failed: ${e.message} — skipping Suite 08`);
    console.log(`   Raw response (first 300 chars): ${rawResponse.slice(0, 300)}`);
    return null;
  }

  // Strict validation — only keep specs with allowed paths and valid shape
  const valid = testSpecs
    .filter(t => t && typeof t === 'object')
    .filter(t => typeof t.name === 'string' && t.name.length > 0)
    .filter(t => typeof t.path === 'string' && OLLAMA_ALLOWED_PATHS.has(t.path))
    .filter(t => ['GET', 'POST'].includes(String(t.method || 'GET').toUpperCase()))
    .filter(t => Number.isInteger(t.expectStatusMin) && Number.isInteger(t.expectStatusMax))
    .filter(t => t.expectStatusMin <= t.expectStatusMax)
    .slice(0, 10);

  if (valid.length === 0) {
    console.log('⚠️  No valid AI test specs after path validation — skipping Suite 08');
    return null;
  }

  console.log(`🤖 ${valid.length} AI-generated tests validated (${testSpecs.length - valid.length} discarded — invalid paths)`);
  valid._model = model;
  return valid;
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
  const bar = '═'.repeat(52);
  console.log(`\n╔${bar}╗`);
  console.log(`║  NERJA AI — ${title.padEnd(39)}║`);
  console.log(`╚${bar}╝`);
}

function endSuite() {
  const passed = suiteResults.filter(r => r.passed).length;
  const failed = suiteResults.filter(r => !r.passed).length;
  const total = suiteResults.length;
  const retried = suiteResults.filter(r => r.retried).length;
  suites.push({
    id: currentSuite,
    name: currentSuiteTitle,
    total, passed, failed, retried,
    tests: suiteResults.map(r => ({ name: r.name, passed: r.passed, attempts: r.attempts || 1, retried: r.retried || false })),
  });
  const retriedNote = retried > 0 ? ` | ${retried} retried` : '';
  console.log(`\n→ ${passed}/${total} passed | ${failed} failed${retriedNote}`);
  console.log(failed > 0 ? 'STATUS: FAIL' : 'STATUS: PASS');
}

// check() — 3-attempt retry, 2s between attempts, real HTTP only
async function check(name, fn) {
  const MAX_ATTEMPTS = 3;
  let attempts = 0;
  let ok = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const result = await fn();
      if (result) { ok = true; break; }
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ⚠️  attempt ${attempt}/${MAX_ATTEMPTS} — retrying in 2s...`);
        await sleep(2000);
      }
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ⚠️  attempt ${attempt}/${MAX_ATTEMPTS} error: ${e.message} — retrying in 2s...`);
        await sleep(2000);
      }
    }
  }

  const retried = attempts > 1;
  const sym = ok ? '✅' : '❌';
  const suffix = retried ? ` (${attempts} attempts)` : '';
  console.log(`${sym} ${name}${suffix}`);
  const r = { suite: currentSuite, name, passed: ok, attempts, retried };
  suiteResults.push(r);
  allResults.push(r);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  let sessionCookie = '';
  let sessionCookieAfterLogout = '';

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 01 — Authentication Tests
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('01', 'AUTHENTICATION TESTS');

  await check('Valid credentials accepted (HTTP 200)', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
    return r.status === 200;
  });

  await check('Login response contains user object with email', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    return r.status === 200 && r.body && typeof r.body === 'object' &&
      r.body.user && r.body.user.email === EMAIL;
  });

  await check('Login response contains tenant object with plan', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    return r.status === 200 && r.body && typeof r.body === 'object' &&
      r.body.tenant && typeof r.body.tenant.plan === 'string';
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

  await check('GET /api/auth/login → 405 Method Not Allowed', async () => {
    const r = await req('GET', `${BASE}/api/auth/login`);
    return r.status === 405;
  });

  await check('Dashboard protected — unauthenticated → 307 redirect to /login', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, { 'Accept': 'text/html', Cookie: '' });
    const loc = (r.location || '').toLowerCase();
    return r.status === 307 && loc.includes('login');
  });

  await check('Data Room protected — unauthenticated → redirect', async () => {
    const r = await req('GET', `${BASE}/app/data-room`, null, { 'Accept': 'text/html', Cookie: '' });
    return r.status === 307 || r.status === 302 || r.status === 308;
  });

  await check('Campaigns protected — unauthenticated → redirect', async () => {
    const r = await req('GET', `${BASE}/app/campaigns`, null, { 'Accept': 'text/html', Cookie: '' });
    return r.status === 307 || r.status === 302 || r.status === 308;
  });

  await check('Settings protected — unauthenticated → redirect', async () => {
    const r = await req('GET', `${BASE}/app/settings`, null, { 'Accept': 'text/html', Cookie: '' });
    return r.status === 307 || r.status === 302 || r.status === 308;
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 02 — Registration
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('02', 'REGISTRATION TESTS');

  await check('Register with all required fields → 200 + user object', async () => {
    const ts = Date.now();
    const r = await req('POST', `${BASE}/api/auth/register`, {
      email: `test_auto_${ts}@test.invalid`,
      password: 'TestPass123!',
      name: 'Automated Tester',
      tenantName: `Test Store ${ts}`,
    });
    return r.status === 200 && r.body && r.body.user && r.body.tenant;
  });

  await check('Register with missing fields → 400 with error message', async () => {
    const r = await req('POST', `${BASE}/api/auth/register`, {});
    return r.status === 400 && r.body && r.body.message;
  });

  await check('Register with email only → 400 (tenantName required)', async () => {
    const r = await req('POST', `${BASE}/api/auth/register`, { email: 'test@test.com' });
    return r.status === 400;
  });

  await check('Register with existing email → not 200 (conflict)', async () => {
    const r = await req('POST', `${BASE}/api/auth/register`, {
      email: EMAIL,
      password: 'TestPass123!',
      name: 'Duplicate User',
      tenantName: 'Duplicate Store',
    });
    return r.status !== 200;
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 03 — Public Pages Availability
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('03', 'PUBLIC PAGES AVAILABILITY');

  const publicPages = [
    ['Landing Page (/) → reachable', `${BASE}/`],
    ['Login Page (/login) → reachable', `${BASE}/login`],
    ['Signup Page (/signup) → reachable', `${BASE}/signup`],
    ['Forgot Password → reachable', `${BASE}/forgot-password`],
    ['Pricing Page → reachable', `${BASE}/pricing`],
    ['Signup — Growth plan variant → reachable', `${BASE}/signup?plan=growth`],
    ['Signup — Pro plan variant → reachable', `${BASE}/signup?plan=pro`],
  ];

  for (const [name, url] of publicPages) {
    await check(name, async () => {
      const r = await req('GET', url);
      return r.status >= 200 && r.status < 400;
    });
  }

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 04 — Authenticated App Pages
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('04', 'AUTHENTICATED APP PAGES');

  if (!sessionCookie) {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    if (r.status === 200) {
      const sc = r.headers['set-cookie'];
      sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }
  }

  const authHeaders = { Cookie: sessionCookie, 'Accept': 'text/html' };

  const appPages = [
    ['Dashboard (/app/dashboard) → loads', `${BASE}/app/dashboard`],
    ['Analytics (/app/analytics) → loads', `${BASE}/app/analytics`],
    ['Leads (/app/leads) → loads', `${BASE}/app/leads`],
    ['Campaigns (/app/campaigns) → loads', `${BASE}/app/campaigns`],
    ['Campaign Create → loads', `${BASE}/app/campaigns/create-a-new-campaign`],
    ['Campaign Create — Browse Abandonment preset → loads', `${BASE}/app/campaigns/create-a-new-campaign?preset=BROWSE_ABANDONMENT`],
    ['Campaign Create — Cart Abandonment preset → loads', `${BASE}/app/campaigns/create-a-new-campaign?preset=CART_ABANDONMENT`],
    ['Campaign Create — Checkout Abandonment preset → loads', `${BASE}/app/campaigns/create-a-new-campaign?preset=CHECKOUT_ABANDONMENT`],
    ['Integrations (/app/integrations) → loads', `${BASE}/app/integrations`],
    ['Data Room (/app/data-room) → loads', `${BASE}/app/data-room`],
    ['Knowledge Base (/app/data-room/knowledge-base) → loads', `${BASE}/app/data-room/knowledge-base`],
    ['Settings (/app/settings) → loads', `${BASE}/app/settings`],
    ['Plan & Billing (/app/plan-and-billing) → loads', `${BASE}/app/plan-and-billing`],
    ['Getting Started (/app/dashboard/getting-started) → loads', `${BASE}/app/dashboard/getting-started`],
  ];

  for (const [name, url] of appPages) {
    await check(name, async () => {
      const r = await req('GET', url, null, authHeaders);
      return r.status >= 200 && r.status < 400;
    });
  }

  await check('/app/billing → 404 (deprecated URL — not a false pass)', async () => {
    const r = await req('GET', `${BASE}/app/billing`, null, authHeaders);
    return r.status === 404;
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 05 — Session / Logout
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('05', 'SESSION & LOGOUT TESTS');

  const authH = { Cookie: sessionCookie };

  await check('Logout → returns {"ok": true}', async () => {
    const r = await req('POST', `${BASE}/api/auth/logout`, {}, authH);
    return r.status === 200 && r.body && r.body.ok === true;
  });

  const freshLogin = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (freshLogin.status === 200) {
    const sc = freshLogin.headers['set-cookie'];
    sessionCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
  }
  const freshAuth = { Cookie: sessionCookie };

  const logoutResp = await req('POST', `${BASE}/api/auth/logout`, {}, freshAuth);
  const logoutCookies = logoutResp.headers['set-cookie'];
  sessionCookieAfterLogout = Array.isArray(logoutCookies) ? logoutCookies.join('; ') : (logoutCookies || '');

  await check('After logout — dashboard returns 307 redirect (session cleared)', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, { Cookie: sessionCookieAfterLogout, 'Accept': 'text/html' });
    return r.status === 307 || r.status === 302 || r.status === 308;
  });

  await check('After logout — redirect destination is /login', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, { Cookie: sessionCookieAfterLogout, 'Accept': 'text/html' });
    const loc = (r.location || '').toLowerCase();
    return loc.includes('login');
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 06 — Security Headers
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('06', 'SECURITY HEADERS');

  await check('HTTPS enforced — site serves over TLS (port 443)', async () => {
    const r = await req('GET', `${BASE}/`);
    return r.status >= 200 && r.status < 500;
  });

  await check('Server header does NOT leak nginx version', async () => {
    const r = await req('GET', `${BASE}/login`);
    const server = (r.headers['server'] || '').toLowerCase();
    return !(/nginx\/\d+\.\d+/.test(server));
  });

  await check('X-Frame-Options or CSP frame-ancestors present', async () => {
    const r = await req('GET', `${BASE}/login`);
    const xfo = r.headers['x-frame-options'] || '';
    const csp = r.headers['content-security-policy'] || '';
    return xfo.length > 0 || csp.includes('frame-ancestors');
  });

  await check('X-Content-Type-Options: nosniff present', async () => {
    const r = await req('GET', `${BASE}/login`);
    return (r.headers['x-content-type-options'] || '').toLowerCase() === 'nosniff';
  });

  await check('Strict-Transport-Security (HSTS) header present', async () => {
    const r = await req('GET', `${BASE}/login`);
    return !!r.headers['strict-transport-security'];
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 07 — API Endpoint Correctness
  // ──────────────────────────────────────────────────────────────────────────
  startSuite('07', 'API ENDPOINT CORRECTNESS');

  const apiLogin = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  let apiCookie = '';
  if (apiLogin.status === 200) {
    const sc = apiLogin.headers['set-cookie'];
    apiCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
  }
  const apiAuth = { Cookie: apiCookie };

  await check('POST /api/auth/login → 200 with session cookie', async () => {
    const r = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    const sc = r.headers['set-cookie'];
    return r.status === 200 && (Array.isArray(sc) ? sc.length > 0 : !!sc);
  });

  await check('POST /api/auth/logout → 200', async () => {
    const r = await req('POST', `${BASE}/api/auth/logout`, {}, apiAuth);
    return r.status === 200;
  });

  const apiLogin2 = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
  if (apiLogin2.status === 200) {
    const sc = apiLogin2.headers['set-cookie'];
    apiCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
  }
  const apiAuth2 = { Cookie: apiCookie };

  await check('POST /api/auth/register → exists (200 or 4xx, not 404)', async () => {
    const r = await req('POST', `${BASE}/api/auth/register`, {});
    return r.status !== 404;
  });

  const rscHeaders = { ...apiAuth2, 'RSC': '1', 'Accept': 'text/x-component' };

  await check('/app/dashboard RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/dashboard`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/analytics RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/analytics`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/leads RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/leads`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/campaigns RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/campaigns`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/integrations RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/integrations`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/settings RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/settings`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/data-room RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/data-room`, null, rscHeaders);
    return r.status === 200;
  });

  await check('/app/plan-and-billing RSC data → 200', async () => {
    const r = await req('GET', `${BASE}/app/plan-and-billing`, null, rscHeaders);
    return r.status === 200;
  });

  endSuite();

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 08 — Ollama AI-Generated Tests (conditional)
  // ──────────────────────────────────────────────────────────────────────────
  const aiTestSpecs = await generateAITests();

  if (aiTestSpecs && aiTestSpecs.length > 0) {
    startSuite('08', 'AI-GENERATED TESTS (OLLAMA ' + (aiTestSpecs._model || 'local') + ')');

    // Fresh auth cookie for AI tests
    const aiLoginResp = await req('POST', `${BASE}/api/auth/login`, { email: EMAIL, password: PASSWORD });
    let aiAuthCookie = '';
    if (aiLoginResp.status === 200) {
      const sc = aiLoginResp.headers['set-cookie'];
      aiAuthCookie = Array.isArray(sc) ? sc.join('; ') : (sc || '');
    }

    for (const spec of aiTestSpecs) {
      const method = String(spec.method || 'GET').toUpperCase();
      const path = spec.path;
      const useAuth = spec.auth === true;
      const body = spec.body || null;
      const minStatus = spec.expectStatusMin;
      const maxStatus = spec.expectStatusMax;

      await check(`[AI] ${spec.name}`, async () => {
        const hdrs = useAuth
          ? { Cookie: aiAuthCookie, 'Accept': 'text/html' }
          : { 'Accept': 'application/json' };
        // Real HTTP request — status from actual server, never fabricated
        const r = await req(method, `${BASE}${path}`, body, hdrs);
        return r.status >= minStatus && r.status <= maxStatus;
      });
    }

    endSuite();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Full Suite Summary
  // ──────────────────────────────────────────────────────────────────────────
  const totalPassed = allResults.filter(r => r.passed).length;
  const totalFailed = allResults.filter(r => !r.passed).length;
  const totalRetried = allResults.filter(r => r.retried).length;
  const total = allResults.length;

  const bar = '═'.repeat(52);
  console.log(`\n╔${bar}╗`);
  console.log(`║  NERJA AI — FULL SUITE SUMMARY                     ║`);
  console.log(`╚${bar}╝`);
  console.log(`Total Tests : ${total}`);
  console.log(`Passed      : ${totalPassed}`);
  console.log(`Failed      : ${totalFailed}`);
  if (totalRetried > 0) console.log(`Retried     : ${totalRetried}`);

  const jsonOut = {
    timestamp: new Date().toISOString(),
    runNumber: parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10),
    total, passed: totalPassed, failed: totalFailed, retried: totalRetried,
    duration: Date.now() - startTime,
    suites,
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
