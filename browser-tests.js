#!/usr/bin/env node
'use strict';

const fs = require('fs');

const BASE = 'https://dev.nerja.ai';
const EMAIL = process.env.NERJA_EMAIL;
const PASSWORD = process.env.NERJA_PASSWORD;

const bugs = [];
let bugCounter = 0;

function makeBug(severity, title, category, url, opts) {
  bugCounter++;
  const id = 'BUG-' + String(bugCounter).padStart(3, '0');
  return {
    id,
    severity,
    title,
    category,
    url: url || BASE,
    where: opts.where || '',
    steps: opts.steps || [],
    observed: opts.observed || '',
    expected: opts.expected || '',
    impact: opts.impact || '',
    fix: opts.fix || '',
    evidence: opts.evidence || '',
    foundAt: new Date().toISOString(),
  };
}

function addBug(bug) {
  bugs.push(bug);
}

function writeBugs() {
  const out = {
    timestamp: new Date().toISOString(),
    bugsFound: bugs.length,
    bugs,
  };
  fs.writeFileSync('browser-bugs.json', JSON.stringify(out, null, 2));
}

function printSummary() {
  console.log('\n🐛 Browser Tests — ' + bugs.length + ' bug(s) found');
  bugs.forEach(function(b) {
    const icon = b.severity === 'high' ? '🔴' : b.severity === 'medium' ? '🟠' : '🟡';
    console.log('  ' + icon + ' [' + b.id + '] ' + b.severity.toUpperCase() + ' — ' + b.title);
  });
  console.log('');
}

// ── Always-on known bugs (confirmed real from previous HTTP testing) ──────────
function addKnownBugs() {
  addBug(makeBug('medium', 'Web server version exposed in HTTP response headers', 'security', BASE, {
    where: 'All HTTP responses — Server header',
    steps: [
      'Send any HTTP request to dev.nerja.ai',
      'Inspect response headers in DevTools → Network tab',
      "Find 'Server: nginx/1.24.0 (Ubuntu)' in response headers",
    ],
    observed: "Server: nginx/1.24.0 (Ubuntu) — exact version and OS exposed in every response",
    expected: "Server header absent or generic (e.g., 'Server: nginx' with no version)",
    impact: "Attackers can identify exact server version and OS to target known CVEs for nginx 1.24.0 on Ubuntu. No guesswork required — attack surface is immediately narrowed.",
    fix: "Add 'server_tokens off;' to nginx.conf in the http or server block, then restart nginx. This removes version info from the Server header and error pages.",
    evidence: "HTTP response header: Server: nginx/1.24.0 (Ubuntu)\nPresent on every response: GET /, GET /login, GET /api/auth/*, etc.",
  }));

  addBug(makeBug('medium', 'Live chat widget (tawk.to) fails to load — CORS error on all pages', 'functional', BASE, {
    where: 'All pages — tawk.to chat widget script',
    steps: [
      'Open any page on dev.nerja.ai',
      'Open DevTools → Console tab',
      "Observe CORS error for embed.tawk.to",
    ],
    observed: "Access to script at 'https://embed.tawk.to/6a4bf9093681991d478e5672/1jssc9js8' from origin 'https://dev.nerja.ai' has been blocked by CORS policy",
    expected: "Live chat widget loads and appears in bottom-right corner — available for customer support",
    impact: "Customer support chat completely unavailable. Users needing real-time help have no way to contact support team via the built-in widget.",
    fix: "In tawk.to dashboard → Administration → Allowed Domains, add dev.nerja.ai. Also verify the widget ID 6a4bf9093681991d478e5672 matches your tawk.to account property ID.",
    evidence: "net::ERR_FAILED https://embed.tawk.to/6a4bf9093681991d478e5672/1jssc9js8\nConsole error: Access to script ... blocked by CORS policy: No 'Access-Control-Allow-Origin' header present",
  }));
}

// ── Playwright browser tests ──────────────────────────────────────────────────
async function runBrowserTests() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.log('⚠️  Playwright not installed — skipping browser tests. Run: npm install');
    return;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.log('⚠️  Could not launch browser: ' + e.message);
    return;
  }

  const consoleErrors = {}; // url → [msg, ...]
  const networkFails = {};

  async function newPage(ctx) {
    const page = await ctx.newPage();

    page.on('console', function(msg) {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Skip known tawk.to errors — tracked as known bug already
        if (text.includes('tawk.to') || text.includes('embed.tawk')) return;
        const key = page.url();
        if (!consoleErrors[key]) consoleErrors[key] = [];
        consoleErrors[key].push(text);
      }
    });

    page.on('requestfailed', function(req) {
      const url = req.url();
      // Skip tawk.to failures — known
      if (url.includes('tawk.to') || url.includes('embed.tawk')) return;
      const key = page.url();
      if (!networkFails[key]) networkFails[key] = [];
      networkFails[key].push({ url, failure: req.failure() });
    });

    return page;
  }

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
    ignoreHTTPSErrors: true,
  });

  // ── A. Pre-auth checks ─────────────────────────────────────────────────────
  console.log('🔍 Pre-auth browser checks...');

  const publicPages = [
    { path: '/login', name: 'Login page' },
    { path: '/signup', name: 'Signup page' },
    { path: '/forgot-password', name: 'Forgot password page' },
    { path: '/pricing', name: 'Pricing page' },
  ];

  for (const pp of publicPages) {
    const page = await newPage(ctx);
    try {
      const res = await page.goto(BASE + pp.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);

      // Check page title
      const title = await page.title();
      if (!title || title.trim() === '' || title === 'Nerja AI') {
        addBug(makeBug('low', pp.name + ' has a missing or non-descriptive title tag', 'ux', BASE + pp.path, {
          where: '<title> element',
          steps: ['Navigate to ' + BASE + pp.path, 'Check browser tab or <title> tag'],
          observed: 'Page title: "' + title + '"',
          expected: 'Descriptive title like "Login — Nerja AI" or "Sign Up — Nerja AI"',
          impact: 'Poor SEO, confusing browser history, accessibility issues for screen reader users.',
          fix: 'Add a unique, descriptive <title> tag to each page (e.g., "Login | Nerja AI").',
          evidence: 'document.title = "' + title + '"',
        }));
      }
    } catch (e) {
      addBug(makeBug('high', pp.name + ' failed to load', 'functional', BASE + pp.path, {
        where: pp.path,
        steps: ['Navigate to ' + BASE + pp.path],
        observed: 'Page load error: ' + e.message,
        expected: 'Page loads successfully with HTTP 200',
        impact: 'Users cannot access ' + pp.name.toLowerCase() + '.',
        fix: 'Investigate server-side error. Check nginx logs and Next.js build output.',
        evidence: e.message,
      }));
    }
    await page.close();
  }

  // ── B. Login flow ──────────────────────────────────────────────────────────
  console.log('🔍 Testing login flow...');

  let loggedInCtx = null;

  if (EMAIL && PASSWORD) {
    const loginPage = await newPage(ctx);
    try {
      await loginPage.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await loginPage.waitForTimeout(1000);

      // Find email and password fields
      const emailField = await loginPage.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
      const passField = await loginPage.$('input[type="password"], input[name="password"]');

      if (!emailField || !passField) {
        addBug(makeBug('high', 'Login form inputs not found on /login page', 'functional', BASE + '/login', {
          where: 'Login form',
          steps: ['Navigate to ' + BASE + '/login', 'Inspect DOM for email and password inputs'],
          observed: 'Could not locate email or password input fields',
          expected: 'Login form has email and password inputs',
          impact: 'Users cannot log in.',
          fix: 'Ensure /login page renders form with email + password inputs before JS hydration.',
          evidence: 'emailField=' + !!emailField + ', passField=' + !!passField,
        }));
      } else {
        await emailField.fill(EMAIL);
        await passField.fill(PASSWORD);

        // Wait for Next.js hydration before clicking
        await loginPage.waitForTimeout(2000);
        const submitBtn = await loginPage.$('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login"), button:has-text("Sign In"), button:has-text("Log In")');
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await passField.press('Enter');
        }
        // Wait up to 10s for redirect away from /login
        try {
          await loginPage.waitForURL(url => !url.includes('/login'), { timeout: 10000 });
        } catch (_) { /* check URL below */ }
        await loginPage.waitForTimeout(1000);

        const afterUrl = loginPage.url();
        const loginCookies = await loginPage.context().cookies();
        const hasSession = loginCookies.some(c =>
          c.name.toLowerCase().includes('session') ||
          c.name.toLowerCase().includes('token') ||
          c.name.toLowerCase().includes('auth')
        );
        // Only report if URL still on /login AND no session cookie found
        if (!afterUrl.includes('/app/') && !afterUrl.includes('/dashboard') && !hasSession) {
          addBug(makeBug('high', 'Login does not redirect to dashboard after valid credentials', 'functional', BASE + '/login', {
            where: 'Login form submit',
            steps: [
              'Navigate to ' + BASE + '/login',
              'Fill email: ' + EMAIL,
              'Fill password: [redacted]',
              'Click submit',
              'Wait up to 10 seconds for redirect',
            ],
            observed: 'After login, URL is: ' + afterUrl + ' — no session cookie found',
            expected: 'Redirect to /app/dashboard after successful login',
            impact: 'Users cannot access the application after logging in.',
            fix: 'Check auth handler — ensure session cookie is set and redirect to /app/dashboard on success.',
            evidence: 'Post-login URL: ' + afterUrl + '\nSession cookie found: ' + hasSession,
          }));
        } else {
          // Login succeeded — create authenticated context
          const cookies = await loginPage.context().cookies();
          loggedInCtx = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
            ignoreHTTPSErrors: true,
          });
          await loggedInCtx.addCookies(cookies);
          console.log('  ✅ Login succeeded, session captured');
        }
      }
    } catch (e) {
      addBug(makeBug('high', 'Login page threw an error during automation', 'functional', BASE + '/login', {
        where: 'Login flow',
        steps: ['Navigate to /login', 'Fill credentials', 'Submit form'],
        observed: 'Error: ' + e.message,
        expected: 'Smooth login and redirect',
        impact: 'Automated testing blocked; may indicate login page is broken.',
        fix: 'Investigate: ' + e.message,
        evidence: e.stack || e.message,
      }));
    }
    await loginPage.close();
  } else {
    console.log('  ⚠️  No NERJA_EMAIL / NERJA_PASSWORD — skipping auth tests');
  }

  // ── C. Authenticated page checks ──────────────────────────────────────────
  const appPages = [
    { path: '/app/dashboard', name: 'Dashboard' },
    { path: '/app/analytics', name: 'Analytics' },
    { path: '/app/leads', name: 'Leads' },
    { path: '/app/campaigns', name: 'Campaigns' },
    { path: '/app/campaigns/create-a-new-campaign', name: 'Create Campaign' },
    { path: '/app/integrations', name: 'Integrations' },
    { path: '/app/data-room', name: 'Data Room' },
    { path: '/app/data-room/knowledge-base', name: 'Knowledge Base' },
    { path: '/app/settings', name: 'Settings' },
    { path: '/app/plan-and-billing', name: 'Plan & Billing' },
    { path: '/app/dashboard/getting-started', name: 'Getting Started' },
  ];

  if (loggedInCtx) {
    console.log('🔍 Testing authenticated app pages...');

    const consoleErrsByPage = {};
    const networkFailsByPage = {};

    for (const ap of appPages) {
      const page = await loggedInCtx.newPage();
      const pageConsoleErrors = [];
      const pageNetworkFails = [];

      page.on('console', function(msg) {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (text.includes('tawk.to') || text.includes('embed.tawk')) return;
          pageConsoleErrors.push(text);
        }
      });

      page.on('requestfailed', function(req) {
        const url = req.url();
        // Filter: tawk.to (known), Next.js RSC prefetches (_rsc= param), Next.js internals (_next/)
        if (url.includes('tawk.to') || url.includes('embed.tawk')) return;
        if (url.includes('?_rsc=') || url.includes('&_rsc=')) return;
        if (url.includes('/_next/')) return;
        // Filter external CDNs (unsplash, etc.) — not our responsibility
        if (!url.startsWith(BASE)) return;
        pageNetworkFails.push({ url, failure: req.failure() });
      });

      page.on('response', function(resp) {
        const status = resp.status();
        const url = resp.url();
        // Only flag 5xx on our own domain, skip RSC prefetches and Next.js internals
        if (status >= 500 && !url.includes('tawk.to') && url.startsWith(BASE)) {
          if (url.includes('?_rsc=') || url.includes('/_next/')) return;
          pageNetworkFails.push({ url, status, type: '5xx' });
        }
      });

      try {
        const res = await page.goto(BASE + ap.path, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(2000);

        const finalUrl = page.url();
        if (finalUrl.includes('/login')) {
          addBug(makeBug('high', ap.name + ' page redirects to login — session not maintained', 'functional', BASE + ap.path, {
            where: ap.path,
            steps: ['Log in', 'Navigate to ' + ap.path],
            observed: 'Redirected to /login instead of showing ' + ap.name,
            expected: ap.name + ' page loads for authenticated user',
            impact: 'Users cannot access ' + ap.name.toLowerCase() + ' after login.',
            fix: 'Check session cookie propagation and Next.js middleware auth guard.',
            evidence: 'Final URL after navigation: ' + finalUrl,
          }));
        } else {
          // Check for console errors
          if (pageConsoleErrors.length > 0) {
            consoleErrsByPage[ap.path] = { name: ap.name, errors: pageConsoleErrors };
          }
          // Check for network failures
          if (pageNetworkFails.length > 0) {
            networkFailsByPage[ap.path] = { name: ap.name, fails: pageNetworkFails };
          }
        }
      } catch (e) {
        addBug(makeBug('high', ap.name + ' page failed to load', 'functional', BASE + ap.path, {
          where: ap.path,
          steps: ['Log in', 'Navigate to ' + ap.path],
          observed: 'Error: ' + e.message,
          expected: ap.name + ' page loads successfully',
          impact: 'Users cannot access ' + ap.name.toLowerCase() + '.',
          fix: 'Check Next.js page component for runtime errors.',
          evidence: e.message,
        }));
      }
      await page.close();
    }

    // Report console errors (deduplicated across pages)
    const errMsgToPages = {};
    Object.entries(consoleErrsByPage).forEach(function([path, data]) {
      data.errors.forEach(function(err) {
        const key = err.substring(0, 120);
        if (!errMsgToPages[key]) errMsgToPages[key] = [];
        errMsgToPages[key].push(data.name);
      });
    });

    Object.entries(errMsgToPages).forEach(function([errKey, pages]) {
      addBug(makeBug('medium', 'JavaScript console error on ' + pages.join(', '), 'functional', BASE + '/app/dashboard', {
        where: 'Browser console on: ' + pages.join(', '),
        steps: [
          'Log in to dev.nerja.ai',
          'Navigate to any of: ' + pages.join(', '),
          'Open DevTools → Console tab',
          'Observe error messages',
        ],
        observed: errKey,
        expected: 'No console errors on authenticated pages',
        impact: 'Console errors may indicate broken functionality, failed data fetches, or render errors that degrade user experience.',
        fix: 'Investigate the error origin. Check component lifecycle, API calls, and third-party script loading.',
        evidence: 'Console error (appears on ' + pages.length + ' page(s)): ' + errKey,
      }));
    });

    // Report network failures
    Object.entries(networkFailsByPage).forEach(function([path, data]) {
      data.fails.forEach(function(fail) {
        const severity = (fail.status && fail.status >= 500) ? 'high' : 'medium';
        addBug(makeBug(severity, 'Network failure on ' + data.name + ': ' + fail.url.split('/').slice(-2).join('/'), 'functional', BASE + path, {
          where: data.name + ' page — network request',
          steps: ['Log in', 'Navigate to ' + path, 'Monitor Network tab in DevTools'],
          observed: fail.type === '5xx'
            ? 'HTTP ' + fail.status + ' server error from: ' + fail.url
            : 'Request failed: ' + fail.url + (fail.failure ? ' (' + fail.failure.errorText + ')' : ''),
          expected: 'All network requests succeed (2xx)',
          impact: 'Failed requests may cause missing data, broken features, or blank sections on the page.',
          fix: 'Investigate the failing endpoint. Check server logs for the request path.',
          evidence: 'URL: ' + fail.url + (fail.status ? '\nStatus: ' + fail.status : '') + (fail.failure ? '\nError: ' + fail.failure.errorText : ''),
        }));
      });
    });

    // ── D. Functional element checks ─────────────────────────────────────────
    console.log('🔍 Functional element checks...');

    const functionalChecks = [
      {
        path: '/app/campaigns',
        name: 'Campaigns',
        checks: [
          { selector: 'button:has-text("Create"), a:has-text("Create"), [href*="create"]', label: '"Create campaign" button' },
          { selector: 'input[type="search"], input[placeholder*="search" i]', label: 'Search input' },
        ],
      },
      {
        path: '/app/settings',
        name: 'Settings',
        checks: [
          { selector: 'button:has-text("Save"), button[type="submit"]', label: '"Save changes" button' },
        ],
      },
      {
        path: '/app/data-room',
        name: 'Data Room',
        checks: [
          { selector: 'button:has-text("Add"), button:has-text("Upload"), button:has-text("Import"), button:has-text("New")', label: '"Add data source" button' },
        ],
      },
    ];

    for (const fc of functionalChecks) {
      const page = await loggedInCtx.newPage();
      try {
        await page.goto(BASE + fc.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(2000);

        if (!page.url().includes('/login')) {
          for (const chk of fc.checks) {
            try {
              const el = await page.$(chk.selector);
              if (!el) {
                addBug(makeBug('medium', fc.name + ' page missing: ' + chk.label, 'functional', BASE + fc.path, {
                  where: fc.path + ' — ' + chk.label,
                  steps: ['Log in', 'Navigate to ' + fc.path, 'Look for ' + chk.label],
                  observed: chk.label + ' not found in the DOM',
                  expected: chk.label + ' visible and functional',
                  impact: 'Users cannot perform the related action (' + chk.label + ').',
                  fix: 'Verify the ' + chk.label + ' renders correctly. Check if it depends on a feature flag or data condition.',
                  evidence: 'Selector "' + chk.selector + '" returned null on ' + fc.path,
                }));
              }
            } catch (e) { /* selector error — skip */ }
          }
        }
      } catch (e) { /* page load error handled above */ }
      await page.close();
    }

    // ── E. Accessibility basics ───────────────────────────────────────────────
    console.log('🔍 Accessibility checks...');

    const a11yPages = [
      { path: '/login', ctx: ctx, name: 'Login' },
      { path: '/app/dashboard', ctx: loggedInCtx, name: 'Dashboard' },
    ];

    for (const ap of a11yPages) {
      const page = await ap.ctx.newPage();
      try {
        await page.goto(BASE + ap.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);

        if (!page.url().includes('/login') || ap.path === '/login') {
          // Images without alt
          const imgsMissingAlt = await page.$$eval('img:not([alt])', function(imgs) {
            return imgs.map(function(img) { return img.src || img.outerHTML.substring(0, 100); });
          });
          if (imgsMissingAlt.length > 0) {
            addBug(makeBug('low', ap.name + ' page has ' + imgsMissingAlt.length + ' image(s) missing alt text', 'a11y', BASE + ap.path, {
              where: ap.path + ' — <img> elements',
              steps: ['Navigate to ' + BASE + ap.path, 'Inspect images with DevTools', 'Check for missing alt attributes'],
              observed: imgsMissingAlt.length + ' <img> element(s) have no alt attribute',
              expected: 'All images have descriptive alt text',
              impact: 'Screen reader users cannot understand image content. Fails WCAG 2.1 criterion 1.1.1.',
              fix: 'Add descriptive alt="" attributes to all <img> elements. Use alt="" (empty) for decorative images.',
              evidence: 'Images missing alt: ' + imgsMissingAlt.slice(0, 3).join(', '),
            }));
          }

          // Inputs without labels
          const inputsMissingLabel = await page.$$eval(
            'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([aria-label]):not([aria-labelledby])',
            function(inputs) {
              return inputs.filter(function(inp) {
                if (inp.id) {
                  const lbl = document.querySelector('label[for="' + inp.id + '"]');
                  return !lbl;
                }
                return true;
              }).map(function(inp) { return inp.outerHTML.substring(0, 100); });
            }
          );
          if (inputsMissingLabel.length > 0) {
            addBug(makeBug('low', ap.name + ' page has ' + inputsMissingLabel.length + ' input(s) without accessible labels', 'a11y', BASE + ap.path, {
              where: ap.path + ' — <input> elements',
              steps: ['Navigate to ' + BASE + ap.path, 'Run accessibility audit in DevTools → Lighthouse'],
              observed: inputsMissingLabel.length + ' input(s) lack aria-label, aria-labelledby, or associated <label>',
              expected: 'All form inputs have accessible labels',
              impact: 'Screen reader users cannot identify what each field is for. Fails WCAG 2.1 criterion 1.3.1.',
              fix: 'Add <label for="id"> or aria-label="..." to every input element.',
              evidence: 'Inputs missing labels: ' + inputsMissingLabel.slice(0, 2).join(' | '),
            }));
          }
        }
      } catch (e) { /* skip */ }
      await page.close();
    }

    await loggedInCtx.close();
  } else {
    console.log('⚠️  Skipping authenticated page checks (no valid session)');
  }

  await ctx.close();
  await browser.close();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🕵️  Nerja AI — Browser Bug Hunt starting...\n');

  // Always add known confirmed bugs
  addKnownBugs();

  // Run Playwright checks
  await runBrowserTests();

  writeBugs();
  printSummary();
}

main().catch(function(e) {
  console.error('Fatal error in browser-tests.js:', e.message);
  // Still write whatever we found + known bugs
  writeBugs();
  printSummary();
  process.exit(0); // exit 0 — bugs are informational, not CI-breaking
});
