'use strict';

/* ============================================================
   RepoSnap — app logic
   Talks to the RepoSnap FastAPI backend (/api/analyze, /api/ai).
   No build step. Charts use the QuickChart image API, with a local
   canvas-free renderer as the offline fallback.
   ============================================================ */

// Served by FastAPI at the same origin; file:// opens need an explicit backend URL.
const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';
const API_START_HINT = window.location.protocol === 'file:'
  ? 'Start the backend with "uvicorn app.main:app --reload" and open http://127.0.0.1:8000 instead.'
  : 'Make sure the FastAPI server is running, then refresh this page.';

const LS = {
  recent: 'reposnap.recent',
};

const MAX_RECENT = 6;
const PALETTE = ['#5eead4', '#38bdf8', '#c084fc', '#fbbf24', '#4ade80', '#f87171', '#f472b6', '#a3e635'];
const PLACEHOLDER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23131826'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%2379839a'/%3E%3Cpath d='M6 39c0-8 6-13 14-13s14 5 14 13' fill='%2379839a'/%3E%3C/svg%3E";

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);

const el = {
  form: $('searchForm'),
  input: $('repoInput'),
  analyzeBtn: $('analyzeBtn'),
  searchError: $('searchError'),
  searchKbd: $('searchKbd'),
  hero: $('hero'),
  examples: $('examples'),
  recentRow: $('recentRow'),
  recentChips: $('recentChips'),
  clearRecent: $('clearRecent'),
  loading: $('loading'),
  loadingTitle: $('loadingTitle'),
  loadingSub: $('loadingSub'),
  loadingSteps: $('loadingSteps'),
  errorCard: $('errorCard'),
  errorTitle: $('errorTitle'),
  errorMsg: $('errorMsg'),
  errorHint: $('errorHint'),
  retryBtn: $('retryBtn'),
  results: $('results'),
  repoHeader: $('repoHeader'),
  statsGrid: $('statsGrid'),
  aiBody: $('aiBody'),
  aiCopyBtn: $('aiCopyBtn'),
  aiRegenBtn: $('aiRegenBtn'),
  aiModelLabel: $('aiModelLabel'),
  langChartWrap: $('langChartWrap'),
  metricsChartWrap: $('metricsChartWrap'),
  metricsScaleTag: $('metricsScaleTag'),
  commitsList: $('commitsList'),
  commitsCount: $('commitsCount'),
  commitsAllLink: $('commitsAllLink'),
  newSearchBtn: $('newSearchBtn'),
  backTopBtn: $('backTopBtn'),
  brandLink: $('brandLink'),
  howLink: $('howLink'),
  toast: $('toast'),
  toastIcon: $('toastIcon'),
  toastMsg: $('toastMsg'),
  toastClose: $('toastClose'),
};

const state = {
  currentRepo: null,
  lastContext: null,
  lastQuery: '',
  lastAiText: '',
  aiSeq: 0,
  aiBusy: false,
  aiModel: '',
  abort: null,
  toastTimer: null,
};

/* ---------------- Storage helpers ---------------- */

function storeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function storeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

/* ---------------- Utilities ---------------- */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '0';
  if (value >= 1e9) return (value / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(value >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(value));
}

function formatBytes(n) {
  const value = Number(n) || 0;
  if (value < 1024) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = value / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  const units = [
    [31536000, 'y'], [2592000, 'mo'], [604800, 'w'],
    [86400, 'd'], [3600, 'h'], [60, 'm'],
  ];
  for (const [sec, label] of units) {
    const v = Math.floor(seconds / sec);
    if (v >= 1) return `${v}${label} ago`;
  }
  return 'just now';
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function safeHttpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function pct(part, total) {
  if (!total) return 0;
  return (part / total) * 100;
}

async function copyText(text, successMessage) {
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(successMessage, 'success');
  } catch {
    showToast('Could not copy to the clipboard.', 'error');
  }
}

function debounceFrame(fn) {
  let queued = false;
  return (...args) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...args); });
  };
}

/* ---------------- Icons ---------------- */

const ICON = {
  clock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  branch: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  scale: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M5 7h14"/><path d="M7 7l-3 6h6z"/><path d="M17 7l-3 6h6z"/><path d="M9 21h6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="3" y1="11" x2="21" y2="11"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/></svg>',
  external: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8L19.7 10l-5.8 1.9L12 17.7l-1.9-5.8L4.3 10l5.8-1.9z"/><path d="M19 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>',
  stars: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  forks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"/><path d="M12 12v3"/></svg>',
  issues: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  watchers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  toastSuccess: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  toastError: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  toastInfo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

/* ---------------- Toast ---------------- */

function showToast(message, type = 'info') {
  const icon = type === 'success' ? ICON.toastSuccess : type === 'error' ? ICON.toastError : ICON.toastInfo;
  el.toastIcon.innerHTML = icon;
  el.toastMsg.textContent = message;
  el.toast.className = `toast ${type}`;
  // force reflow so a repeated toast re-runs the transition
  void el.toast.offsetWidth;
  el.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(hideToast, 4600);
}

function hideToast() {
  el.toast.classList.remove('show');
  clearTimeout(state.toastTimer);
}

/* ---------------- Repo parsing ---------------- */

function parseRepo(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;

  s = s.replace(/^git@github\.com:/i, '');
  s = s.replace(/^ssh:\/\/git@github\.com\//i, '');
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^www\./i, '');
  s = s.replace(/^github\.com\//i, '');
  s = s.split(/[?#]/)[0];
  s = s.replace(/\/+$/, '').replace(/\.git$/i, '');

  const parts = s.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, repo] = parts;
  const valid = /^[A-Za-z0-9_.-]+$/;
  if (!valid.test(owner) || !valid.test(repo)) return null;
  if (owner === '.' || owner === '..' || repo === '.' || repo === '..') return null;

  return { owner, repo, full: `${owner}/${repo}` };
}

/* ---------------- Markdown (small + safe) ---------------- */

function renderInline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function renderMarkdown(md) {
  const lines = escapeHtml(md).split(/\r?\n/);
  let html = '';
  let list = null;
  let codeLines = [];
  let inCode = false;

  const closeList = () => {
    if (list) { html += `</${list}>`; list = null; }
  };

  for (const line of lines) {
    const t = line.trim();

    if (t.startsWith('```')) {
      if (inCode) {
        html += `<pre><code>${codeLines.join('\n')}</code></pre>`;
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!t) { closeList(); continue; }

    const heading = t.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      html += `<h3>${renderInline(heading[2])}</h3>`;
      continue;
    }

    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${renderInline(bullet[1])}</li>`;
      continue;
    }

    const ordered = t.match(/^\d+[.)]\s+(.*)$/);
    if (ordered) {
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${renderInline(ordered[1])}</li>`;
      continue;
    }

    if (t.startsWith('&gt; ')) {
      closeList();
      html += `<blockquote>${renderInline(t.slice(5))}</blockquote>`;
      continue;
    }

    closeList();
    html += `<p>${renderInline(t)}</p>`;
  }

  if (inCode && codeLines.length) html += `<pre><code>${codeLines.join('\n')}</code></pre>`;
  closeList();
  return html;
}

/* ---------------- RepoSnap API ---------------- */

class AppError extends Error {
  constructor(code, title, message, hint = '') {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.title = title;
    this.hint = hint;
  }
}

function detailMessage(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.msg === 'string') {
      return first.msg.replace(/^Value error,\s*/i, '');
    }
  }
  return fallback;
}

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new AppError(
      'network',
      'Cannot reach the RepoSnap API',
      'The frontend could not connect to the backend.',
      API_START_HINT
    );
  }

  let payload = null;
  try { payload = await res.json(); } catch { /* non-JSON error body */ }

  if (res.ok) return payload;

  if (res.status === 400 || res.status === 422) {
    throw new AppError(
      'invalid',
      'That URL is not a valid GitHub repository',
      detailMessage(payload, 'The address must point to a public github.com repository.'),
      'Use the form https://github.com/owner/repo.'
    );
  }
  if (res.status === 401) {
    throw new AppError(
      'auth',
      'GitHub authentication failed',
      detailMessage(payload, 'The GitHub token configured on the server was rejected.'),
      'Update GITHUB_TOKEN in the server .env file and restart the API.'
    );
  }
  if (res.status === 404) {
    throw new AppError(
      'notfound',
      'Repository not found',
      detailMessage(payload, 'Double-check the URL — it may be private, renamed, or misspelled.'),
      'Only public repositories can be analyzed.'
    );
  }
  if (res.status === 429) {
    throw new AppError(
      'rate-limit',
      'GitHub rate limit reached',
      detailMessage(payload, 'The server has used its GitHub API quota for this hour.'),
      'Wait a few minutes, or add a GITHUB_TOKEN to .env for 5,000 requests/hour.'
    );
  }
  if (res.status === 504) {
    throw new AppError(
      'timeout',
      'GitHub timed out',
      detailMessage(payload, 'The GitHub API did not respond in time.'),
      'Please try again in a moment.'
    );
  }
  if (res.status >= 500) {
    throw new AppError(
      'server',
      `Backend error (${res.status})`,
      detailMessage(payload, 'The RepoSnap API hit an unexpected error.'),
      'Check the server logs, then try again.'
    );
  }
  throw new AppError(
    'http',
    `Request failed (${res.status})`,
    detailMessage(payload, 'Something went wrong while analyzing this repository.'),
    'Please try again in a moment.'
  );
}

/* ---------------- View state ---------------- */

function setView(view) {
  el.hero.classList.toggle('compact', view !== 'landing');
  el.howLink.classList.toggle('hidden', view !== 'landing');
  el.loading.classList.toggle('hidden', view !== 'loading');
  el.results.classList.toggle('hidden', view !== 'results');
  el.errorCard.classList.toggle('hidden', view !== 'error');
  el.loading.setAttribute('aria-busy', view === 'loading' ? 'true' : 'false');
}

function setStep(index, allDone = false) {
  const steps = Array.from(el.loadingSteps.children);
  steps.forEach((node, i) => {
    node.classList.toggle('done', allDone || i < index);
    node.classList.toggle('active', !allDone && i === index);
  });
}

function setLoading(title, sub) {
  el.loadingTitle.textContent = title;
  el.loadingSub.textContent = sub;
}

function setSearchError(message) {
  el.searchError.textContent = message || '';
  el.input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function setAnalyzing(busy) {
  el.analyzeBtn.disabled = busy;
  el.analyzeBtn.classList.toggle('is-loading', busy);
  const label = el.analyzeBtn.querySelector('.btn-label');
  if (label) label.textContent = busy ? 'Analyzing' : 'Analyze';
  el.analyzeBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function showError(err) {
  const e = err instanceof AppError
    ? err
    : new AppError('unknown', 'Unexpected error', err?.message || 'Something went wrong.', 'Please try again.');

  el.errorTitle.textContent = e.title;
  el.errorMsg.textContent = e.message;
  el.errorHint.textContent = e.hint;
  setView('error');
  window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  showToast(e.message, 'error');
}

/* ---------------- Recents ---------------- */

function getRecent() {
  try {
    const parsed = JSON.parse(storeGet(LS.recent) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function addRecent(full) {
  const list = getRecent().filter((r) => r.toLowerCase() !== full.toLowerCase());
  list.unshift(full);
  storeSet(LS.recent, JSON.stringify(list.slice(0, MAX_RECENT)));
  renderRecent();
}

function renderRecent() {
  const list = getRecent();
  el.recentRow.classList.toggle('hidden', list.length === 0);
  el.recentChips.innerHTML = list.map((repo) => `
    <button class="chip chip-recent" type="button" data-repo="${escapeHtml(repo)}">
      ${ICON.clock.replace('width="12" height="12"', 'width="11" height="11"')}
      ${escapeHtml(repo)}
    </button>`).join('');
}

/* ---------------- Rendering: repo header ---------------- */

function renderRepoHeader(repo) {
  const owner = repo.owner || '';
  const licenseName = repo.license || '';
  const homepage = safeHttpUrl(repo.homepage);

  const tags = [];
  if (repo.language) tags.push(`<span class="repo-tag lang">${escapeHtml(repo.language)}</span>`);
  if (licenseName) tags.push(`<span class="repo-tag license">${escapeHtml(licenseName)}</span>`);
  if (repo.archived) tags.push('<span class="repo-tag warn">Archived</span>');
  else if (repo.fork) tags.push('<span class="repo-tag fork">Fork</span>');
  (repo.topics || []).slice(0, 6).forEach((t) => {
    tags.push(`<span class="repo-tag topic">#${escapeHtml(t)}</span>`);
  });

  const repoUrl = safeHttpUrl(repo.url) || `https://github.com/${escapeHtml(repo.full_name || '')}`;

  const facts = [];
  if (repo.updated_at) {
    facts.push(`<span class="fact" title="Last updated">${ICON.clock}<span>updated <b>${escapeHtml(timeAgo(repo.updated_at))}</b></span></span>`);
  }
  if (repo.default_branch) {
    facts.push(`<span class="fact" title="Default branch">${ICON.branch}<b>${escapeHtml(repo.default_branch)}</b></span>`);
  }
  if (licenseName) {
    facts.push(`<span class="fact" title="License">${ICON.scale}<b>${escapeHtml(licenseName)}</b></span>`);
  }
  if (repo.created_at) {
    facts.push(`<span class="fact" title="Created">${ICON.calendar}<span>created <b>${escapeHtml(formatDate(repo.created_at))}</b></span></span>`);
  }
  if (homepage) {
    facts.push(`<span class="fact">${ICON.globe}<a href="${escapeHtml(homepage)}" target="_blank" rel="noopener noreferrer">homepage ↗</a></span>`);
  }

  el.repoHeader.innerHTML = `
    <div class="repo-top">
      <img class="repo-avatar" src="${escapeHtml(repo.avatar_url || PLACEHOLDER_AVATAR)}" alt="" width="64" height="64" loading="lazy" />
      <div class="repo-meta">
        <div class="repo-name">
          <a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">
            <span class="owner">${escapeHtml(owner)}</span><span class="slash">/</span>${escapeHtml(repo.name)}<span class="ext-icon">${ICON.external}</span>
          </a>
        </div>
        ${repo.description ? `<p class="repo-desc">${escapeHtml(repo.description)}</p>` : ''}
        <div class="repo-tags">${tags.join('')}</div>
      </div>
      <div class="repo-actions">
        <a class="btn-ghost sm" href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener noreferrer">
          ${ICON.external} GitHub
        </a>
        <button class="btn-ghost sm" id="copyRepoBtn" type="button">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy link
        </button>
      </div>
    </div>
    ${facts.length ? `<div class="repo-facts">${facts.join('')}</div>` : ''}
  `;

  $('copyRepoBtn').addEventListener('click', () => {
    copyText(repoUrl, 'Repository link copied.');
  });

  const avatar = el.repoHeader.querySelector('.repo-avatar');
  avatar?.addEventListener('error', () => { avatar.src = PLACEHOLDER_AVATAR; }, { once: true });
}

/* ---------------- Rendering: stats ---------------- */

function animateNumber(node, target) {
  if (REDUCE_MOTION) {
    node.textContent = formatNumber(target);
    return;
  }
  const duration = 650;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = formatNumber(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderStats(repo) {
  const stats = [
    { key: 'stars', label: 'Stars', value: repo.stars || 0, sub: 'stargazers', icon: ICON.stars },
    { key: 'forks', label: 'Forks', value: repo.forks || 0, sub: 'copies forked', icon: ICON.forks },
    { key: 'issues', label: 'Open issues', value: repo.open_issues || 0, sub: 'issues + PRs', icon: ICON.issues },
    { key: 'watchers', label: 'Watchers', value: repo.watchers || 0, sub: 'subscribed', icon: ICON.watchers },
  ];

  el.statsGrid.innerHTML = stats.map((s) => `
    <div class="stat ${s.key}">
      <div class="stat-top"><span class="stat-icon">${s.icon}</span><span>${s.label}</span></div>
      <div class="stat-value" data-target="${s.value}">0</div>
      <div class="stat-sub">${escapeHtml(s.sub)}</div>
    </div>`).join('');

  el.statsGrid.querySelectorAll('.stat-value').forEach((node) => {
    animateNumber(node, Number(node.dataset.target) || 0);
  });
}

/* ---------------- Charts: QuickChart + local fallback ---------------- */

const QC_ENDPOINT = 'https://quickchart.io/chart';
const QC_TIMEOUT_MS = 8000;
const METRIC_COLORS = ['#fbbf24', '#38bdf8', '#4ade80', '#c084fc'];

function chartUrl(config, width, height) {
  const params = new URLSearchParams({
    c: JSON.stringify(config),
    w: String(Math.max(200, Math.round(width))),
    h: String(Math.max(150, Math.round(height))),
    devicePixelRatio: '2',
    backgroundColor: 'transparent',
    version: '4',
    format: 'png',
  });
  return `${QC_ENDPOINT}?${params.toString()}`;
}

// QuickChart is the primary renderer; the local chart takes over if the image fails or stalls.
function mountChartImage(host, { src, alt, fallback }) {
  const img = host.querySelector('.quickchart-img');
  let settled = false;
  const done = (ok) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    host.classList.remove('chart-loading');
    host.classList.add(ok ? 'chart-ready' : 'chart-failed');
    if (!ok) fallback();
  };
  const timer = setTimeout(() => done(false), QC_TIMEOUT_MS);
  img.addEventListener('load', () => done(true), { once: true });
  img.addEventListener('error', () => done(false), { once: true });
  img.alt = alt;
  img.src = src;
}

function localDonut(top, total) {
  const primary = top[0];
  const R = 58;
  const C = 2 * Math.PI * R;
  const GAP = top.length > 1 ? 3.2 : 0;
  let offset = 0;

  const segments = top.map((slice, i) => {
    const len = (slice.value / total) * C;
    const visible = Math.max(len - GAP, 0.6);
    const share = pct(slice.value, total);
    const seg = `
      <circle class="donut-seg" cx="80" cy="80" r="${R}" fill="none"
        stroke="${slice.color}" stroke-width="17"
        stroke-dasharray="${visible.toFixed(2)} ${(C - visible).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 80 80)"
        style="animation-delay:${i * 55}ms">
        <title>${escapeHtml(slice.name)} — ${share.toFixed(1)}% (${formatBytes(slice.value)})</title>
      </circle>`;
    offset += len;
    return seg;
  }).join('');

  const ariaSummary = top.map((s) => `${s.name} ${pct(s.value, total).toFixed(0)}%`).join(', ');

  return `
    <svg viewBox="0 0 160 160" role="img" aria-label="Language breakdown: ${escapeHtml(ariaSummary)}">
      <circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--bg-soft)" stroke-width="17"></circle>
      ${segments}
    </svg>
    <div class="donut-center" aria-hidden="true">
      <span class="donut-pct">${pct(primary.value, total).toFixed(0)}%</span>
      <span class="donut-label">${escapeHtml(primary.name)}</span>
    </div>`;
}

function renderLanguageChart(languages) {
  const entries = Object.entries(languages || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    el.langChartWrap.innerHTML = '<div class="chart-fallback">No language data available.</div>';
    return;
  }

  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  const top = entries.slice(0, 6).map(([name, value], i) => ({
    name, value, color: PALETTE[i % PALETTE.length],
  }));
  const other = entries.slice(6).reduce((sum, [, v]) => sum + v, 0);
  if (other > 0) top.push({ name: 'Other', value: other, color: '#5c6478' });

  const primary = top[0];
  const ariaSummary = top.map((s) => `${s.name} ${pct(s.value, total).toFixed(0)}%`).join(', ');

  const config = {
    type: 'doughnut',
    data: {
      labels: top.map((s) => s.name),
      datasets: [{
        data: top.map((s) => Number(((s.value / total) * 100).toFixed(2))),
        backgroundColor: top.map((s) => s.color),
        borderWidth: 0,
        hoverOffset: 0,
      }],
    },
    options: {
      cutout: '64%',
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { display: false },
      },
      layout: { padding: 4 },
    },
  };

  el.langChartWrap.innerHTML = `
    <div class="donut-layout">
      <div class="donut chart-loading">
        <img class="quickchart-img" width="168" height="168" decoding="async" alt="" />
        <div class="donut-center" aria-hidden="true">
          <span class="donut-pct">${pct(primary.value, total).toFixed(0)}%</span>
          <span class="donut-label">${escapeHtml(primary.name)}</span>
        </div>
      </div>
      <ul class="legend">
        ${top.map((s) => {
          const share = pct(s.value, total);
          const label = share >= 10 ? Math.round(share) : share.toFixed(1);
          return `
            <li class="legend-item">
              <span class="legend-dot" style="background:${s.color}"></span>
              <span class="legend-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
              <span class="legend-pct">${label}%</span>
              <span class="legend-bytes">${formatBytes(s.value)}</span>
            </li>`;
        }).join('')}
      </ul>
    </div>`;

  mountChartImage(el.langChartWrap.querySelector('.donut'), {
    src: chartUrl(config, 168, 168),
    alt: `Language breakdown donut chart: ${ariaSummary}`,
    fallback: () => {
      el.langChartWrap.querySelector('.donut').innerHTML = localDonut(top, total);
    },
  });
}

/* ---------------- Rendering: community bars ---------------- */

function localMetrics(items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const scale = (value) => (Math.log10(value + 1) / Math.log10(max + 1)) * 100;
  const summary = items.map((i) => `${i.label} ${formatNumber(i.value)}`).join(', ');

  return `
    <div class="bars" role="img" aria-label="Community metrics: ${escapeHtml(summary)}">
      ${items.map((item, i) => {
        const width = item.value > 0 ? Math.max(scale(item.value), 2) : 0;
        return `
          <div class="bar-row" title="${escapeHtml(item.label)}: ${item.value.toLocaleString()}">
            <div class="bar-head">
              <span class="bar-label">${escapeHtml(item.label)}</span>
              <span class="bar-value">${formatNumber(item.value)}</span>
            </div>
            <div class="bar-track">
              <span class="bar-fill" style="--w:${Math.max(width, 1.5).toFixed(1)}%; --c:${item.color}; animation-delay:${i * 70}ms"></span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderMetricsChart(repo) {
  const items = [
    { label: 'Stars', value: repo.stars || 0, color: METRIC_COLORS[0] },
    { label: 'Forks', value: repo.forks || 0, color: METRIC_COLORS[1] },
    { label: 'Open issues', value: repo.open_issues || 0, color: METRIC_COLORS[2] },
    { label: 'Watchers', value: repo.watchers || 0, color: METRIC_COLORS[3] },
  ];
  const values = items.map((i) => i.value);
  const summary = items.map((i) => `${i.label} ${formatNumber(i.value)}`).join(', ');
  // Log scale reads better for skewed metrics, but it cannot plot zeros.
  const useLog = values.every((v) => v > 0);
  const width = Math.round(el.metricsChartWrap.getBoundingClientRect().width) || 430;
  const height = 228;
  if (el.metricsScaleTag) el.metricsScaleTag.textContent = useLog ? 'log scale' : 'linear scale';

  const config = {
    type: 'bar',
    data: {
      labels: items.map((i) => i.label),
      datasets: [{
        data: values,
        backgroundColor: METRIC_COLORS,
        borderRadius: 6,
        barThickness: 12,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'right',
          offset: 8,
          clamp: true,
          color: '#e9edf5',
          font: { size: 12, weight: 'bold' },
        },
      },
      layout: { padding: { top: 6, right: 56, bottom: 4, left: 0 } },
      scales: {
        x: {
          type: useLog ? 'logarithmic' : 'linear',
          beginAtZero: !useLog,
          grid: { color: 'rgba(255,255,255,0.06)', drawTicks: false },
          border: { display: false },
          ticks: {
            color: '#79839a',
            font: { size: 10 },
            maxRotation: 0,
            maxTicksLimit: width < 400 ? 3 : 5,
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: '#a5aec2',
            font: { size: 12 },
            padding: 10,
          },
        },
      },
    },
  };

  el.metricsChartWrap.innerHTML = `
    <img class="quickchart-img metrics-img" decoding="async" alt="" />
  `;
  el.metricsChartWrap.classList.add('chart-loading');

  mountChartImage(el.metricsChartWrap, {
    src: chartUrl(config, width, height),
    alt: `Community metrics bar chart: ${summary}`,
    fallback: () => { el.metricsChartWrap.innerHTML = localMetrics(items); },
  });
}

/* ---------------- Rendering: commits ---------------- */

function renderCommits(commits, fullName) {
  const items = Array.isArray(commits) ? commits.slice(0, 8) : [];
  el.commitsCount.textContent = items.length ? `${items.length} latest` : '';
  el.commitsAllLink.href = `https://github.com/${fullName}/commits`;

  if (!items.length) {
    el.commitsList.innerHTML = `
      <li class="commits-empty">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        No recent commits found.
      </li>`;
    return;
  }

  el.commitsList.innerHTML = items.map((c) => {
    const message = String(c.message || '').split('\n')[0] || '(no message)';
    const author = c.author || 'unknown';
    const avatar = c.avatar_url || PLACEHOLDER_AVATAR;
    const date = c.date;
    const sha = (c.sha || '').slice(0, 7);
    const url = c.url || `https://github.com/${fullName}/commits`;
    return `
      <li class="commit">
        <img class="commit-avatar" src="${escapeHtml(avatar)}" alt="" width="32" height="32" loading="lazy" />
        <div class="commit-main">
          <div class="commit-msg"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(message)}">${escapeHtml(message)}</a></div>
          <div class="commit-meta">
            <span class="commit-author">${escapeHtml(author)}</span>
            ${date ? `<span aria-hidden="true">·</span><time datetime="${escapeHtml(date)}">${escapeHtml(timeAgo(date))}</time>` : ''}
          </div>
        </div>
        <a class="commit-sha" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open commit">${escapeHtml(sha)}</a>
      </li>`;
  }).join('');

  el.commitsList.querySelectorAll('.commit-avatar').forEach((img) => {
    img.addEventListener('error', () => { img.src = PLACEHOLDER_AVATAR; }, { once: true });
  });
}

/* ---------------- AI overview ---------------- */

function updateAiActions() {
  el.aiCopyBtn.disabled = !state.lastAiText;
  el.aiRegenBtn.disabled = state.aiBusy;
  el.aiCopyBtn.title = state.lastAiText ? 'Copy overview as Markdown' : 'Nothing to copy yet';
  el.aiModelLabel.textContent = state.aiModel || 'Groq';
}

// Turn the backend's structured AIAnalysis into the Markdown this card renders.
function aiToMarkdown(analysis) {
  const text = (value) => String(value || '').trim();
  const bullets = (list) => (Array.isArray(list) ? list.map(text).filter(Boolean) : []);
  const sections = [];

  const summary = text(analysis?.project_summary);
  if (summary) sections.push(summary);

  const what = text(analysis?.what_it_does);
  if (what) sections.push(`### What it does\n${what}`);

  const purpose = text(analysis?.main_purpose);
  if (purpose) sections.push(`### Main purpose\n${purpose}`);

  const users = bullets(analysis?.target_users);
  if (users.length) sections.push(`### Who it's for\n${users.map((u) => `- ${u}`).join('\n')}`);

  const features = bullets(analysis?.key_features);
  if (features.length) sections.push(`### Key features\n${features.map((f) => `- ${f}`).join('\n')}`);

  const techs = bullets(analysis?.technologies);
  if (techs.length) sections.push(`### Technologies\n${techs.map((t) => `- ${t}`).join('\n')}`);

  const observations = bullets(analysis?.repository_health_or_activity_observations);
  if (observations.length) sections.push(`### Metrics & health\n${observations.map((o) => `- ${o}`).join('\n')}`);

  const verdict = text(analysis?.short_verdict);
  if (verdict) sections.push(`> ${verdict}`);

  return sections.join('\n\n');
}

function renderAiOverview(analysis, model, elapsedSeconds) {
  state.aiBusy = false;
  const markdown = aiToMarkdown(analysis);

  if (!markdown) {
    renderAiError('The AI returned an empty overview.', 'Try regenerating the overview.');
    return;
  }

  state.lastAiText = markdown;
  const meta = ['Generated with Groq', model, elapsedSeconds != null ? `${elapsedSeconds}s` : '']
    .filter(Boolean)
    .join(' · ');

  el.aiBody.innerHTML = `
    <div class="ai-content">${renderMarkdown(markdown)}</div>
    <div class="ai-foot">
      <span>${escapeHtml(meta)}</span>
    </div>`;
  updateAiActions();
  showToast('AI overview ready.', 'success');
}

function renderAiError(message, hint) {
  state.aiBusy = false;
  state.lastAiText = '';
  el.aiBody.innerHTML = `
    <div class="ai-error-box" role="alert">
      <strong>Couldn't generate the overview</strong>
      <p>${escapeHtml(message || 'The AI service is unavailable.')}${hint ? ` ${escapeHtml(hint)}` : ''}</p>
      <div class="row">
        <button class="btn-ghost sm" id="aiRetry" type="button">Try again</button>
        <a class="link-btn" href="${API_BASE}/docs">API docs</a>
      </div>
    </div>`;
  $('aiRetry')?.addEventListener('click', generateOverview);
  updateAiActions();
}

async function generateOverview() {
  const ctx = state.lastContext;
  if (!ctx) return;

  const seq = ++state.aiSeq;
  state.aiBusy = true;
  state.lastAiText = '';
  updateAiActions();

  el.aiBody.innerHTML = `
    <div class="ai-skeleton" role="status" aria-label="Generating overview with Groq">
      <div class="sk-line w90"></div>
      <div class="sk-line w75"></div>
      <div class="sk-line w60"></div>
      <div class="sk-line head"></div>
      <div class="sk-line w90"></div>
      <div class="sk-line w75"></div>
    </div>`;

  const started = performance.now();

  try {
    const analysis = await apiFetch('/api/ai', {
      method: 'POST',
      body: JSON.stringify({ repository: ctx.repository, activity: ctx.activity }),
    });
    if (seq !== state.aiSeq) return;

    const elapsed = ((performance.now() - started) / 1000).toFixed(1);
    state.aiModel = ctx.aiModel || state.aiModel || 'Groq';
    renderAiOverview(analysis, state.aiModel, elapsed);
  } catch (err) {
    if (seq !== state.aiSeq) return;
    if (err.name === 'AbortError') return;
    const message = err instanceof AppError ? err.message : (err?.message || 'Unexpected error.');
    const hint = err instanceof AppError ? err.hint : 'The rest of the report is still available.';
    renderAiError(message, hint);
  } finally {
    if (seq === state.aiSeq) {
      state.aiBusy = false;
      updateAiActions();
    }
  }
}

/* ---------------- Deep links ---------------- */

function syncUrl(full) {
  try {
    const url = new URL(window.location.href);
    if (full) url.searchParams.set('repo', full);
    else url.searchParams.delete('repo');
    history.replaceState(null, '', url);
  } catch { /* restricted context, e.g. file:// */ }
}

/* ---------------- Main analyze flow ---------------- */

async function analyze(raw) {
  const parsed = parseRepo(raw);
  if (!parsed) {
    setSearchError('Enter a valid GitHub URL or owner/repo — e.g. facebook/react.');
    el.input.focus();
    return;
  }

  if (state.abort) state.abort.abort();
  const controller = new AbortController();
  state.abort = controller;

  state.lastQuery = `https://github.com/${parsed.full}`;
  el.input.value = state.lastQuery;
  syncUrl(parsed.full);
  setSearchError('');
  state.currentRepo = null;
  state.lastContext = null;
  state.lastAiText = '';
  el.aiBody.innerHTML = '';
  state.aiSeq++;
  updateAiActions();

  setAnalyzing(true);
  setView('loading');
  setStep(0);
  setLoading('Fetching repository…', `GET /repos/${parsed.full} via RepoSnap API`);
  window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });

  // The backend runs every GitHub call plus the AI step in one request, so the
  // step labels advance on a timer while we wait for the single response.
  let step = 0;
  const stepTimer = setInterval(() => {
    step = Math.min(step + 1, 2);
    setStep(step);
    if (step === 1) setLoading('Gathering details…', 'languages · commits · metrics');
    if (step === 2) setLoading('Writing your report…', 'charts, activity and AI overview');
  }, 1500);

  try {
    const data = await apiFetch('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url: state.lastQuery }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;

    const repo = data?.repository;
    if (!repo || !repo.full_name) {
      throw new AppError(
        'bad-response',
        'Unexpected API response',
        'The RepoSnap API returned no repository data.',
        'Please try again in a moment.'
      );
    }

    const activity = data.activity && Array.isArray(data.activity.recent_commits)
      ? data.activity
      : { recent_commits: [] };

    state.currentRepo = repo;
    state.aiModel = data.ai_model || 'Groq';
    state.lastContext = { repository: repo, activity, aiModel: state.aiModel };

    setStep(3, true);
    setLoading('Building your report…', 'rendering charts and activity');
    setView('results');

    renderRepoHeader(repo);
    renderStats(repo);
    // Charts are measured from the visible layout, so they render after the results view is shown.
    renderLanguageChart(repo.languages && typeof repo.languages === 'object' ? repo.languages : {});
    renderMetricsChart(repo);
    renderCommits(activity.recent_commits, repo.full_name || parsed.full);

    if (data.ai_analysis) {
      renderAiOverview(data.ai_analysis, state.aiModel);
    } else {
      renderAiError(
        data.ai_error || 'AI analysis is unavailable.',
        'Repository metrics are still available — AI is an optional extra.'
      );
    }

    addRecent(parsed.full);
    window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) return;
    showError(err);
  } finally {
    clearInterval(stepTimer);
    if (state.abort === controller) {
      state.abort = null;
      setAnalyzing(false);
    }
  }
}

function resetToLanding() {
  if (state.abort) {
    state.abort.abort();
    state.abort = null;
  }
  state.aiSeq++;
  state.currentRepo = null;
  state.lastContext = null;
  state.lastAiText = '';
  state.aiBusy = false;
  el.input.value = '';
  syncUrl(null);
  setSearchError('');
  setAnalyzing(false);
  setView('landing');
  el.loading.setAttribute('aria-busy', 'false');
  updateAiActions();
  window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
  el.input.focus({ preventScroll: true });
}

/* ---------------- Events ---------------- */

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  hideToast();
  analyze(el.input.value);
});

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-repo]');
  if (chip && chip.dataset.repo) {
    hideToast();
    analyze(chip.dataset.repo);
  }
});

el.clearRecent.addEventListener('click', () => {
  storeRemove(LS.recent);
  renderRecent();
  showToast('Recent searches cleared.', 'info');
});

el.newSearchBtn.addEventListener('click', resetToLanding);

el.backTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
});

el.brandLink.addEventListener('click', (e) => {
  e.preventDefault();
  resetToLanding();
});

el.retryBtn.addEventListener('click', () => {
  if (state.lastQuery) analyze(state.lastQuery);
});

el.aiCopyBtn.addEventListener('click', () => {
  if (state.lastAiText) copyText(state.lastAiText, 'AI overview copied.');
});

el.aiRegenBtn.addEventListener('click', () => {
  if (state.lastContext) generateOverview();
});

el.toastClose.addEventListener('click', hideToast);

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = ['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    el.input.focus();
    el.input.select();
    window.scrollTo({ top: 0, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });
    return;
  }
  if (e.key === '/' && !typing) {
    e.preventDefault();
    el.input.focus();
    el.input.select();
    return;
  }
  if (e.key === 'Escape' && document.activeElement === el.input) {
    el.input.blur();
    setSearchError('');
  }
});

/* ---------------- Init ---------------- */

function init() {
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  el.searchKbd.textContent = isMac ? '⌘ K' : 'Ctrl K';
  renderRecent();
  updateAiActions();

  // file:// fallback: point absolute in-app links at the explicit backend origin.
  if (API_BASE) {
    document.querySelectorAll('a[href="/docs"]').forEach((link) => { link.href = `${API_BASE}/docs`; });
  }

  const deepLink = parseRepo(new URLSearchParams(window.location.search).get('repo') || '');
  if (deepLink) {
    el.input.value = `https://github.com/${deepLink.full}`;
    analyze(deepLink.full);
  } else if (window.innerWidth > 760) {
    el.input.focus({ preventScroll: true });
  }
}

init();
