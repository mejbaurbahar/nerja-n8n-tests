# Nerja AI — Automated Test Suite

Fully free, open-source test automation for [Nerja AI](https://dev.nerja.ai/). Runs 23 tests every hour via GitHub Actions and publishes a live dashboard to GitHub Pages.

**Live dashboard:** https://mejbaurbahar.github.io/nerja-n8n-tests/

## What's Tested

| Suite | Count | Coverage |
|-------|-------|----------|
| **01 Auth** | 6 | Valid login, wrong password, unknown email, empty fields, dashboard protection |
| **02 Public Pages** | 4 | Landing, Login, Signup, Forgot Password |
| **03 App Pages** | 7 | Dashboard, Analytics, Leads, Campaigns, Integrations, Settings, Billing |
| **04 Functional** | 6 | Analytics API, Leads API, Campaigns API, Integrations API, Settings API, Logout |
| **Total** | **23** | Auth security, page availability, API health |

## How It Works

```
GitHub Actions (hourly)
  ├─ Node.js test-runner.js   → runs 23 HTTP tests, writes results.json
  ├─ Ollama + Qwen 2.5 0.5B  → AI analysis of results, writes ai-analysis.txt
  ├─ generate-report.html.js  → builds docs/index.html (n8n-style dashboard)
  └─ peaceiris/actions-gh-pages → deploys to GitHub Pages
```

No Docker. No paid services. Pure Node.js stdlib for HTTP tests.

## Project Structure

```
nerja-automation/
├── .github/workflows/run-tests.yml   # CI/CD pipeline
├── n8n/                              # Original workflow JSONs (reference)
│   ├── 01-auth-tests.json
│   ├── 02-public-pages.json
│   ├── 03-app-pages-authenticated.json
│   ├── 04-functional-tests.json
│   └── 05-schedule-runner.json
├── docs/index.html                   # Auto-generated dashboard (GitHub Pages)
├── test-runner.js                    # 23-test Node.js test suite
├── generate-report.js                # Builds the HTML dashboard from results.json
├── .env.example                      # Local credentials template
└── README.md
```

## CI/CD Setup (100% Free)

GitHub Actions is free on public repos — unlimited minutes.

### 1. Add Secrets

Go to **Settings → Secrets and variables → Actions** and add:
- `NERJA_EMAIL` — test account email
- `NERJA_PASSWORD` — test account password

### 2. Enable GitHub Pages

Go to **Settings → Pages** and set:
- **Source:** Deploy from a branch
- **Branch:** `gh-pages` / `/ (root)`

### 3. Trigger a Run

**Actions → Nerja AI — N8N Test Suite → Run workflow**

Results appear in:
- GitHub Actions logs (step-by-step terminal output)
- GitHub Pages dashboard (updated after each run)
- Downloadable artifacts: `results.json`, `results-all.log`, `ai-analysis.txt`

## Local Run

```bash
# Copy credentials template
cp .env.example .env
# Edit .env — set NERJA_EMAIL and NERJA_PASSWORD

# Run tests
source .env && node test-runner.js

# Generate dashboard (reads results.json)
node generate-report.js
# Open docs/index.html in browser
```

## AI Analysis

After every run, [Ollama](https://ollama.com) runs **Qwen 2.5 0.5B** (Alibaba, Apache 2.0, ~400MB, CPU-only) inside the GitHub Actions runner:

1. Installs Ollama on the runner
2. Pulls `qwen2.5:0.5b`
3. Sends test results as a prompt
4. Writes plain-English analysis to `ai-analysis.txt`
5. Embeds analysis in the GitHub Pages dashboard

No API keys. No paid AI. Entirely self-hosted.

## Stack

| Tool | Purpose | License |
|------|---------|---------|
| [Node.js stdlib `https`](https://nodejs.org) | HTTP test runner | MIT |
| [GitHub Actions](https://github.com/features/actions) | CI/CD — free on public repos | Free |
| [Ollama](https://github.com/ollama/ollama) | Local LLM runtime | MIT |
| [Qwen 2.5 0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B) | AI analysis | Apache 2.0 |
| [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages) | Pages deployment | MIT |

## Test Output

```
╔══════════════════════════════════════════════════╗
║  NERJA AI — AUTHENTICATION TESTS                 ║
╚══════════════════════════════════════════════════╝
✅ Valid credentials accepted (HTTP 200)
✅ Wrong password correctly rejected (not 200)
✅ Unknown email correctly rejected (not 200)
✅ Empty email correctly rejected (not 200)
✅ Empty password correctly rejected (not 200)
✅ Dashboard protected — requires authentication

→ 6/6 passed | 0 failed

... (3 more suites) ...

╔══════════════════════════════════════════════════╗
║  NERJA AI — FULL SUITE SUMMARY                   ║
╚══════════════════════════════════════════════════╝
Total Tests : 23
Passed      : 23
Failed      : 0

STATUS: ✅ ALL 23 TESTS PASSED
```
