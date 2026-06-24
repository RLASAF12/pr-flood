# 🌊 pr-flood

**AI PR triage for open-source maintainers.**

GitHub has 17 million AI-generated PRs per month (up 325% since Sep 2025). One-in-ten is legitimate. The rest eat your review time — and 45% introduce OWASP Top 10 vulnerabilities.

`pr-flood` scans a repo's open PRs, scores each one for human vs. AI origin using heuristics on public GitHub data, and generates an interactive HTML dashboard so you can prioritize the PRs worth your time.

---

## Demo

```
$ node index.js microsoft/vscode --limit=50

🌊  pr-flood scanning microsoft/vscode (limit: 50 PRs)

   ⭐  170,000 stars · 8,432 open issues/PRs

   📡  Fetching open PRs...
   Found 50 open PRs. Scoring...

   [1/50] #201432 feat: add multi-cursor...  🚨 score=7 (AI Slop)
   [2/50] #201430 fix: terminal focus...     ✅ score=1 (Likely Human)
   ...

──────────────────────────────────────────────────────────────
📊  RESULTS: microsoft/vscode
──────────────────────────────────────────────────────────────
   🚨  AI Slop:      23 (46%)
   ⚠️   Needs Review: 14
   ✅  Likely Human: 13
   📈  Avg score:    4.2
──────────────────────────────────────────────────────────────

📄  Report written to: /path/to/report.html
🌐  Opening report in browser...
```

The dashboard opens automatically with sortable/filterable PRs, score distribution chart, and expandable signal explanations.

---

## What's Inside

```
pr-flood/
├── index.js          # CLI entry point
├── package.json
└── lib/
    ├── github.js     # GitHub REST API wrapper
    ├── scorer.js     # Heuristic scoring engine
    └── reporter.js   # HTML dashboard generator
```

---

## Quick Start

```bash
# Clone or copy this folder
cd pr-flood
npm install

# Set your GitHub PAT (needs repo:read scope)
export GITHUB_PAT=ghp_your_token_here

# Scan a repo
node index.js facebook/react
node index.js vercel/next.js --limit=50
node index.js owner/repo --out=my-report.html
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--limit=N` | 80 | Number of open PRs to scan (max 100) |
| `--out=FILE` | `report.html` | Output HTML file name |
| `--no-open` | — | Don't auto-open browser after scan |
| `--token=TOKEN` | env | GitHub PAT (or `GITHUB_PAT` env var) |
| `--verbose` | — | Print scored results to stdout |

---

## How Scoring Works

Each PR is scored on a scale that starts at 0. Signals push the score up (AI indicators) or down (human indicators):

| Signal | Score |
|--------|-------|
| Bot account (login matches known bot patterns) | +5 |
| AI keywords in title or body (Claude, Copilot, Cursor, GPT…) | +4 |
| Co-authored-by: AI trailer in body or commit | +3 |
| Large diff (>500 lines changed) | +2 |
| PR created within 2 min of last commit | +2 |
| Zero comments or reviews | +1 |
| Auto-PR title pattern without issue reference | +1 |
| References a specific GitHub issue | −3 |
| Small focused change (<50 lines, ≤2 files) | −2 |
| Long descriptive body (>500 chars) | −2 |

**Verdicts:**
- `score ≥ 5` → 🚨 **AI Slop** — almost certainly machine-generated
- `score 3–4` → ⚠️ **Needs Review** — ambiguous, worth a quick look
- `score ≤ 2` → ✅ **Likely Human** — review normally

---

## Requirements

- Node.js 18+
- GitHub Personal Access Token with `public_repo` (or `repo`) scope

---

## Limitations

- Heuristics only — no ML model. False positives/negatives exist.
- The first 20 PRs get commit + file enrichment (deeper signals). PRs 21+ are scored on PR-level data only (avoids GitHub rate limits).
- Closed PRs are fetched for trend stats only, not scored.
- Does not read PR diff content — just metadata.

---

## Built by

[Harel Asaf](https://harelasaf.com) — AI Specialist at Elementor. Part of the [Ben nightly builder](https://github.com/RLASAF12) series.

> Finds where organizations bleed time. Builds the AI systems that fix it.
