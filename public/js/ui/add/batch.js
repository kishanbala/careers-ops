// Phase 3D Add role: pure helpers (no DOM), unit-tested in tests/view-add.test.js.
export const MAX_BATCH = 5; // decision 4 on #27: at most 5 per run (the API allows 20 requests per IP per 10 minutes)
export const HANDOFF_KEY = 'kairo:handoff-jd'; // session key, spec §6 (3C hands a JD to Add role)

// One job per block; a line holding only `---` separates them (BATCH-01). Blank blocks are dropped.
export function splitJds(raw) {
  if (typeof raw !== 'string') return [];
  return raw.split(/^[ \t]*-{3,}[ \t]*$/m).map(s => s.trim()).filter(Boolean);
}

export function planBatch(raw, max = MAX_BATCH) {
  const all = splitJds(raw);
  return { items: all.slice(0, max), total: all.length, skipped: Math.max(0, all.length - max) };
}

// First readable line of a JD, shortened, for rows that have no result yet.
export function snippet(jd, n = 90) {
  const line = String(jd == null ? '' : jd).split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > n ? `${line.slice(0, n - 1).trimEnd()}…` : line;
}

// After one of these the next items would fail the same way, so the rest are not sent.
export const STOP_KINDS = Object.freeze(['empty-profile', 'rate-limited', 'paused']);

// rows: [{status: 'waiting'|'running'|'done'|'failed'|'skipped'}]
export function batchSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const n = s => list.filter(r => r.status === s).length;
  const done = n('done'), failed = n('failed'), skipped = n('skipped');
  const parts = [`${done} of ${list.length} evaluated`];
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} not run`);
  return `${parts.join(', ')}.`;
}

export function hashQuery(hash) {
  const q = typeof hash === 'string' ? hash.split('?')[1] : '';
  const out = {};
  for (const [k, v] of new URLSearchParams(q || '')) if (!(k in out)) out[k] = v;
  return out;
}

// `#/add?jd=1` means a JD waits in sessionStorage. Read once, then removed. Returns '' when there is none.
export function takeHandoff(hash, storage) {
  if (hashQuery(hash).jd !== '1' || !storage) return '';
  try {
    const v = storage.getItem(HANDOFF_KEY);
    storage.removeItem(HANDOFF_KEY);
    return typeof v === 'string' ? v : '';
  } catch { return ''; }
}

export const SAVE_FAILED = 'Browser storage is full, so this role was not saved. Export a backup from Home and free some space, then try again.';
