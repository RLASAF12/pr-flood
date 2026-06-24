#!/usr/bin/env node
/**
 * pr-flood — AI PR triage CLI
 * Usage: node index.js owner/repo [--limit=80] [--out=report.html] [--no-open]
 *
 * Scores each open PR for human vs. AI origin using heuristics on GitHub data.
 * Writes an interactive HTML dashboard and optionally opens it in your browser.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchPRs, fetchPRCommits, fetchPRFiles, fetchRepo } = require('./lib/github');
const { scorePR, summarizeResults } = require('./lib/scorer');
const { generateReport } = require('./lib/reporter');

// ── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
  pr-flood — AI PR triage for OSS maintainers

  Usage:
    node index.js <owner/repo> [options]

  Options:
    --limit=N       Number of open PRs to scan (default: 80, max: 100)
    --out=FILE      Output HTML file (default: report.html)
    --no-open       Don't auto-open the report in the browser
    --token=TOKEN   GitHub PAT (or set GITHUB_PAT env var)
    --verbose       Print scored results to stdout

  Examples:
    node index.js microsoft/vscode
    node index.js facebook/react --limit=50 --out=react-prs.html
    GITHUB_PAT=ghp_xxx node index.js vercel/next.js
  `);
  process.exit(0);
}

const repoArg = args.find(a => !a.startsWith('--'));
if (!repoArg || !repoArg.includes('/')) {
  console.error('❌  Please provide a repo in owner/repo format.');
  process.exit(1);
}

const [owner, repo] = repoArg.split('/');

const getFlag = (name, fallback) => {
  const a = args.find(a => a.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : fallback;
};

const limit = parseInt(getFlag('limit', '80'), 10);
const outFile = getFlag('out', 'report.html');
const noOpen = args.includes('--no-open');
const verbose = args.includes('--verbose');
const tokenArg = getFlag('token', '');

// Resolve GitHub token: --token > GITHUB_PAT env > ENV.md fallback
let GITHUB_TOKEN = tokenArg || process.env.GITHUB_PAT || '';

if (!GITHUB_TOKEN) {
  // Try .env file in current directory (local dev convenience)
  const dotEnvPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(dotEnvPath)) {
    const content = fs.readFileSync(dotEnvPath, 'utf8');
    const m = content.match(/GITHUB_PAT=([^\s\n]+)/);
    if (m) { GITHUB_TOKEN = m[1]; }
  }
}

if (!GITHUB_TOKEN) {
  console.error('❌  No GitHub token found. Set GITHUB_PAT env var or pass --token=ghp_xxx');
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🌊  pr-flood scanning ${owner}/${repo} (limit: ${limit} PRs)\n`);

  // Fetch repo metadata
  let repoData = null;
  try {
    repoData = await fetchRepo(owner, repo, GITHUB_TOKEN);
    console.log(`   ⭐  ${repoData.stargazers_count.toLocaleString()} stars · ${repoData.open_issues_count} open issues/PRs`);
  } catch (e) {
    console.warn(`   ⚠️  Could not fetch repo metadata: ${e.message}`);
  }

  // Fetch open PRs
  console.log(`\n   📡  Fetching open PRs...`);
  let openPRs = [];
  try {
    const { open } = await fetchPRs(owner, repo, GITHUB_TOKEN, limit);
    openPRs = open;
  } catch (e) {
    console.error(`❌  Failed to fetch PRs: ${e.message}`);
    process.exit(1);
  }

  if (openPRs.length === 0) {
    console.log('   ✅  No open PRs found! Nothing to triage.');
    process.exit(0);
  }

  console.log(`   Found ${openPRs.length} open PRs. Scoring...\n`);

  // Score each PR (with optional commit + file data for deeper signals)
  const ENRICH_LIMIT = 20; // Only enrich top N to stay under rate limits
  const results = [];

  for (let i = 0; i < openPRs.length; i++) {
    const pr = openPRs[i];
    process.stdout.write(`   [${i + 1}/${openPRs.length}] #${pr.number} ${pr.title.slice(0, 50)}...`);

    // Enrich with commits + files for better signal (only first N)
    if (i < ENRICH_LIMIT) {
      const [commits, files] = await Promise.all([
        fetchPRCommits(owner, repo, pr.number, GITHUB_TOKEN),
        fetchPRFiles(owner, repo, pr.number, GITHUB_TOKEN),
      ]);
      pr.commits_data = commits;
      pr.files_data = files;
    }

    const scored = scorePR(pr);
    results.push(scored);

    const icon = scored.verdict === 'AI Slop' ? '🚨' : scored.verdict === 'Needs Review' ? '⚠️' : '✅';
    process.stdout.write(` ${icon} score=${scored.score} (${scored.verdict})\n`);
  }

  const summary = summarizeResults(results);

  // Print summary to stdout
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊  RESULTS: ${owner}/${repo}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`   🚨  AI Slop:      ${summary.aiSlop.length} (${Math.round(summary.aiSlop.length / results.length * 100)}%)`);
  console.log(`   ⚠️   Needs Review: ${summary.needsReview.length}`);
  console.log(`   ✅  Likely Human: ${summary.likelyHuman.length}`);
  console.log(`   📈  Avg score:    ${summary.avgScore}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (verbose) {
    results
      .sort((a, b) => b.score - a.score)
      .forEach(r => {
        console.log(`  ${r.emoji} [${r.score}] #${r.prNumber} ${r.title.slice(0, 60)}`);
        r.signals.forEach(s => console.log(`       ${s}`));
      });
    console.log('');
  }

  // Generate HTML report
  const html = generateReport({
    owner,
    repo,
    results,
    summary,
    scannedAt: new Date().toISOString(),
    repoData,
  });

  const outPath = path.resolve(outFile);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`📄  Report written to: ${outPath}`);

  // Open in browser
  if (!noOpen) {
    try {
      const { default: open } = await import('open');
      await open(outPath);
      console.log('🌐  Opening report in browser...\n');
    } catch (_) {
      console.log(`   (Could not auto-open — open ${outPath} manually)\n`);
    }
  }

  console.log('✅  Done.\n');
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
