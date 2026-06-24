/**
 * reporter.js — HTML report generator for pr-flood results
 */

/**
 * Escape HTML special characters
 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a date string to relative "X days ago" or absolute
 */
function relativeDate(dateStr) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

/**
 * Verdict color mapping
 */
const VERDICT_CLASS = {
  'AI Slop': 'slop',
  'Needs Review': 'review',
  'Likely Human': 'human',
};

/**
 * Generate the full HTML dashboard
 */
function generateReport({ owner, repo, results, summary, scannedAt, repoData }) {
  const { aiSlop, needsReview, likelyHuman, avgScore } = summary;
  const total = results.length;

  // Sort: AI slop first (highest score), then needs review, then human
  const sorted = [...results].sort((a, b) => b.score - a.score);

  const slopPct = total ? Math.round((aiSlop.length / total) * 100) : 0;

  const stars = repoData ? repoData.stargazers_count.toLocaleString() : '—';
  const openPRs = repoData ? repoData.open_issues_count : '—';

  function renderRow(r) {
    const cls = VERDICT_CLASS[r.verdict] || 'review';
    const signals = r.signals.map(s => `<li>${esc(s)}</li>`).join('');
    return `
      <tr class="pr-row ${cls}" onclick="toggleSignals(this)">
        <td class="pr-num"><a href="${esc(r.url)}" target="_blank" rel="noopener">#${r.prNumber}</a></td>
        <td class="pr-title">${esc(r.title.slice(0, 80))}${r.title.length > 80 ? '…' : ''}</td>
        <td class="pr-author">@${esc(r.author)}</td>
        <td class="pr-score">${r.score}</td>
        <td class="pr-verdict"><span class="badge badge-${cls}">${r.emoji} ${esc(r.verdict)}</span></td>
        <td class="pr-meta">${r.additions}+/${r.deletions}- · ${relativeDate(r.createdAt)}</td>
      </tr>
      <tr class="signals-row hidden">
        <td colspan="6"><ul class="signals">${signals || '<li>No signals triggered</li>'}</ul></td>
      </tr>`;
  }

  const rows = sorted.map(renderRow).join('');

  // Mini bar chart data (score distribution 0-10)
  const buckets = Array(11).fill(0);
  results.forEach(r => {
    const b = Math.max(0, Math.min(10, r.score));
    buckets[b]++;
  });
  const bucketsJson = JSON.stringify(buckets);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>pr-flood — ${esc(owner)}/${esc(repo)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }

    header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.2rem; font-weight: 600; }
    header .repo-link { font-size: 0.9rem; color: #8b949e; }
    header .timestamp { margin-left: auto; font-size: 0.8rem; color: #8b949e; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; padding: 20px 24px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; text-align: center; }
    .stat-card .num { font-size: 2rem; font-weight: 700; }
    .stat-card .label { font-size: 0.75rem; color: #8b949e; margin-top: 4px; text-transform: uppercase; letter-spacing: .05em; }
    .stat-slop .num { color: #f85149; }
    .stat-review .num { color: #d29922; }
    .stat-human .num { color: #3fb950; }
    .stat-avg .num { color: #58a6ff; }

    .chart-container { max-width: 600px; margin: 0 24px 20px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
    .chart-container h2 { font-size: 0.85rem; color: #8b949e; margin-bottom: 12px; }

    .pr-table-wrap { padding: 0 24px 40px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #161b22; padding: 10px 12px; text-align: left; font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #30363d; position: sticky; top: 0; }
    tr.pr-row { border-bottom: 1px solid #21262d; cursor: pointer; transition: background .1s; }
    tr.pr-row:hover { background: #161b22; }
    tr.pr-row.slop { border-left: 3px solid #f85149; }
    tr.pr-row.review { border-left: 3px solid #d29922; }
    tr.pr-row.human { border-left: 3px solid #3fb950; }
    td { padding: 10px 12px; vertical-align: middle; }
    td.pr-num { color: #8b949e; font-family: monospace; }
    td.pr-score { font-weight: 700; font-size: 1rem; }
    tr.slop td.pr-score { color: #f85149; }
    tr.review td.pr-score { color: #d29922; }
    tr.human td.pr-score { color: #3fb950; }
    td.pr-meta { color: #8b949e; font-size: 0.8rem; white-space: nowrap; }

    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .badge-slop { background: rgba(248,81,73,.15); color: #f85149; }
    .badge-review { background: rgba(210,153,34,.15); color: #d29922; }
    .badge-human { background: rgba(63,185,80,.15); color: #3fb950; }

    tr.signals-row { background: #0d1117; }
    tr.signals-row.hidden { display: none; }
    ul.signals { padding: 10px 12px 10px 24px; list-style: disc; }
    ul.signals li { padding: 2px 0; font-size: 0.8rem; color: #8b949e; }

    .filter-bar { padding: 12px 24px; display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-btn { background: #21262d; border: 1px solid #30363d; color: #e6edf3; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; }
    .filter-btn.active { background: #388bfd22; border-color: #58a6ff; color: #58a6ff; }
    .filter-btn:hover { border-color: #8b949e; }

    .footer { text-align: center; padding: 20px; font-size: 0.75rem; color: #484f58; }
  </style>
</head>
<body>

<header>
  <div>
    <h1>🌊 pr-flood</h1>
    <div class="repo-link"><a href="https://github.com/${esc(owner)}/${esc(repo)}" target="_blank" rel="noopener">${esc(owner)}/${esc(repo)}</a></div>
  </div>
  <span class="timestamp">Scanned ${new Date(scannedAt).toLocaleString()}</span>
</header>

<div class="stats-grid">
  <div class="stat-card stat-slop">
    <div class="num">${aiSlop.length}</div>
    <div class="label">🚨 AI Slop</div>
  </div>
  <div class="stat-card stat-review">
    <div class="num">${needsReview.length}</div>
    <div class="label">⚠️ Needs Review</div>
  </div>
  <div class="stat-card stat-human">
    <div class="num">${likelyHuman.length}</div>
    <div class="label">✅ Likely Human</div>
  </div>
  <div class="stat-card stat-avg">
    <div class="num">${slopPct}%</div>
    <div class="label">AI Slop Rate</div>
  </div>
  <div class="stat-card">
    <div class="num">${total}</div>
    <div class="label">PRs Scanned</div>
  </div>
  <div class="stat-card">
    <div class="num">${avgScore}</div>
    <div class="label">Avg Score</div>
  </div>
</div>

<div class="chart-container">
  <h2>Score Distribution</h2>
  <canvas id="distChart" height="120"></canvas>
</div>

<div class="filter-bar">
  <button class="filter-btn active" onclick="filterRows('all')">All (${total})</button>
  <button class="filter-btn" onclick="filterRows('slop')">🚨 AI Slop (${aiSlop.length})</button>
  <button class="filter-btn" onclick="filterRows('review')">⚠️ Needs Review (${needsReview.length})</button>
  <button class="filter-btn" onclick="filterRows('human')">✅ Likely Human (${likelyHuman.length})</button>
</div>

<div class="pr-table-wrap">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Title</th>
        <th>Author</th>
        <th>Score</th>
        <th>Verdict</th>
        <th>Size / Age</th>
      </tr>
    </thead>
    <tbody id="prTableBody">
      ${rows}
    </tbody>
  </table>
</div>

<div class="footer">
  pr-flood — AI PR triage for OSS maintainers · click any row to expand signals
</div>

<script>
  // Score distribution chart
  const buckets = ${bucketsJson};
  const ctx = document.getElementById('distChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: buckets.map((_, i) => i),
      datasets: [{
        data: buckets,
        backgroundColor: buckets.map((_, i) =>
          i >= 5 ? '#f8514940' : i >= 3 ? '#d2992240' : '#3fb95040'
        ),
        borderColor: buckets.map((_, i) =>
          i >= 5 ? '#f85149' : i >= 3 ? '#d29922' : '#3fb950'
        ),
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#21262d' }, ticks: { color: '#8b949e' }, title: { display: true, text: 'Score', color: '#8b949e' } },
        y: { grid: { color: '#21262d' }, ticks: { color: '#8b949e', precision: 0 }, beginAtZero: true }
      },
      animation: false,
    }
  });

  // Toggle signal rows
  function toggleSignals(row) {
    const next = row.nextElementSibling;
    if (next && next.classList.contains('signals-row')) {
      next.classList.toggle('hidden');
    }
  }

  // Filter rows by verdict class
  let activeFilter = 'all';
  function filterRows(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const rows = document.querySelectorAll('tr.pr-row');
    rows.forEach(row => {
      const sigRow = row.nextElementSibling;
      if (filter === 'all' || row.classList.contains(filter)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
        if (sigRow) sigRow.style.display = 'none';
      }
    });
  }
</script>
</body>
</html>`;
}

module.exports = { generateReport };
