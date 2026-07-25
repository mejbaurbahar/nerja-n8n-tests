# Nerja AI — N8N Automation Test Suite

Fully free, open-source automation testing for [Nerja AI](https://dev.nerja.ai/) — an e-commerce revenue recovery platform. Built with N8N workflows + GitHub Actions CI/CD + Ollama AI analysis. No Docker, no paid services.

## What's Tested

| Suite | Tests | Coverage |
|-------|-------|----------|
| **01 Auth Tests** | 6 | Valid login, wrong password, nonexistent email, empty fields, unauthenticated dashboard access |
| **02 Public Pages** | 5 | Landing, Login, Signup, Forgot Password, Pricing |
| **03 App Pages (Auth)** | 8 | Dashboard, Analytics, Leads, Campaigns, Integrations, Settings, Billing, Data Room |
| **04 Functional Tests** | 8 | Analytics API, Leads list + Audience Studio, Campaigns filters + create, Email/SMS/WhatsApp integrations, Settings save, Billing plan, NerjaTag + Knowledge Base, Dashboard templates |
| **Total** | **27** | Full stack coverage |

## Project Structure

```
nerja-automation/
├── .github/
│   └── workflows/
│       └── run-tests.yml          # GitHub Actions: runs hourly, free
├── n8n/
│   ├── 01-auth-tests.json         # Authentication test suite
│   ├── 02-public-pages.json       # Public page availability
│   ├── 03-app-pages-authenticated.json  # Authenticated app pages
│   ├── 04-functional-tests.json   # Functional feature tests
│   └── 05-schedule-runner.json    # Scheduled orchestrator (local n8n)
├── .env.example                   # Local env var template
└── README.md
```

## CI/CD: GitHub Actions (100% Free)

Runs automatically **every hour** on GitHub's free tier (unlimited minutes on public repos). Uses Node.js 18 + n8n CLI — no Docker required.

### Setup in 3 Steps

**1. Fork this repo**

**2. Add GitHub Secrets**
Go to `Settings → Secrets and variables → Actions → New repository secret`:
- `NERJA_EMAIL` — Nerja AI test account email
- `NERJA_PASSWORD` — Nerja AI test account password

**3. Trigger a run**
Go to `Actions → Nerja AI — N8N Test Suite → Run workflow`

Results appear as workflow step logs + downloadable artifacts (kept 30 days).

## AI Analysis with Ollama

After every test run, the pipeline automatically:
1. Installs [Ollama](https://ollama.com) (free, open source)
2. Pulls **Qwen 2.5 0.5B** (Alibaba, Apache 2.0 — runs on CPU, ~400MB)
3. Feeds test results to the model
4. Prints a concise AI analysis directly in the CI logs:
   - Overall status
   - Failures with root cause
   - Top priority fix

No API keys. No paid AI services. Entirely self-hosted inside the GitHub Actions runner.

## Local Setup

### Prerequisites
```bash
# Install n8n
npm install -g n8n

# Copy and fill credentials
cp .env.example .env
# Edit .env: set NERJA_EMAIL and NERJA_PASSWORD
```

### Run Tests Locally
```bash
source .env   # or: export NERJA_EMAIL=... NERJA_PASSWORD=...

n8n execute --file n8n/01-auth-tests.json
n8n execute --file n8n/02-public-pages.json
n8n execute --file n8n/03-app-pages-authenticated.json
n8n execute --file n8n/04-functional-tests.json
```

### Import into n8n UI
```bash
n8n start
# Open http://localhost:5678
# Settings → Import workflow → select any JSON from n8n/
```

### Local AI Analysis
```bash
# Install Ollama (Mac/Linux)
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull qwen2.5:0.5b

# Analyze test output
ollama run qwen2.5:0.5b "Analyze these QA results: $(cat results-*.log)"
```

## How N8N Workflows Work

Each workflow JSON is self-contained:

- **Auth tests** (`01`): Sequential chain — each HTTP request node runs one test case, each Code node evaluates the result and accumulates a `tests[]` array, final Code node prints the report.
- **Public pages** (`02`) + **App pages** (`03`): Loop pattern — Code node builds URL list → SplitOut → HTTP GET each → Code eval → Aggregate → Report.
- **Functional tests** (`04`): Sequential feature checks — Login → Extract session cookie → run 8 API checks in chain, each checking the response for expected content.
- **Scheduled runner** (`05`): Hourly ScheduleTrigger → ExecuteWorkflow for each of 01–04 → Aggregate results → IF any failures → format failure/success report.

Credentials are never hardcoded — all workflows read from `process.env.NERJA_EMAIL` and `process.env.NERJA_PASSWORD`.

## Stack

| Tool | Purpose | License |
|------|---------|---------|
| [N8N](https://github.com/n8n-io/n8n) | Workflow automation engine | Sustainable Use |
| [GitHub Actions](https://github.com/features/actions) | CI/CD runner | Free (public repos) |
| [Ollama](https://github.com/ollama/ollama) | Local LLM runtime | MIT |
| [Qwen 2.5 0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B) | AI analysis model | Apache 2.0 |
| Node.js 18 | Runtime | MIT |

## Test Output Example

```
╔══════════════════════════════════════════════╗
║    NERJA AI — FULL SUITE SUMMARY             ║
╚══════════════════════════════════════════════╝

─── results-01.log ───
✅ Valid credentials accepted
✅ Wrong password correctly rejected
✅ Unknown email correctly rejected
✅ Empty email correctly rejected
✅ Empty password correctly rejected
✅ Dashboard requires authentication
→ 6/6 passed | 0 failed

─── results-02.log ───
✅ Landing Page → 200
✅ Login Page → 200
...

╔══════════════════════════════════════════════╗
║    AI ANALYSIS — Qwen 2.5 0.5B (Ollama)     ║
╚══════════════════════════════════════════════╝
Overall: All 27 tests passing. Auth security, page
availability, and core features are healthy.
No failures detected. Recommend adding assertions
for response time thresholds as next priority.
```
