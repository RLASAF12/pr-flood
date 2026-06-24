/**
 * github.js — GitHub REST API wrapper for pr-flood
 * Fetches PRs, commits, and diff stats for a given repo
 */

const GITHUB_API = 'https://api.github.com';

async function apiFetch(url, token) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pr-flood/1.0',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Fetch recent open + recently-closed PRs for a repo
 * Returns up to `limit` PRs (default 80)
 */
async function fetchPRs(owner, repo, token, limit = 80) {
  const perPage = Math.min(limit, 100);
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&per_page=${perPage}&sort=created&direction=desc`;
  const prs = await apiFetch(url, token);

  // Also grab recently closed (last 30 days) for trend stats
  const closedUrl = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=closed&per_page=50&sort=updated&direction=desc`;
  let closed = [];
  try {
    closed = await apiFetch(closedUrl, token);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    closed = closed.filter(p => new Date(p.updated_at).getTime() > cutoff);
  } catch (_) {
    // non-fatal
  }

  return { open: prs, closed };
}

/**
 * Fetch commit details for a PR (first 30 commits)
 */
async function fetchPRCommits(owner, repo, prNumber, token) {
  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=30`;
    return await apiFetch(url, token);
  } catch (_) {
    return [];
  }
}

/**
 * Fetch file change stats for a PR
 */
async function fetchPRFiles(owner, repo, prNumber, token) {
  try {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;
    return await apiFetch(url, token);
  } catch (_) {
    return [];
  }
}

/**
 * Fetch repo metadata
 */
async function fetchRepo(owner, repo, token) {
  return apiFetch(`${GITHUB_API}/repos/${owner}/${repo}`, token);
}

module.exports = { fetchPRs, fetchPRCommits, fetchPRFiles, fetchRepo };
