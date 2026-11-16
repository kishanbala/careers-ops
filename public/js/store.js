// ===== STORAGE (schema v2, additive only: build-plan §3a, Phase 2 spec §5) =====
// v2 only ADDS fields; nothing is renamed or removed, so a v1 build (rollback) still reads v2 data.
// Imports in Node without localStorage: every storage access is guarded.

export const SCHEMA_VERSION = 2;
export const SCHEMA_KEY = 'co_schema';
export const BACKUP_KEY = 'co_backup_v1';
export const DATA_KEYS = Object.freeze(['co_profile', 'co_pipeline', 'co_stories']);
export const QUOTA_BYTES = 5_000_000;

const ROLE_DEFAULTS = Object.freeze({ appliedAt: null, interviewAt: null, nextAction: null, nextActionAt: null });

function defaultStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const parse = s => { try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; } };
const nowIso = () => new Date().toISOString();

// ===== CHANGE LISTENERS =====
const listeners = new Map(); // key -> Set<fn>
export function onChange(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key)?.delete(fn);
}
function notify(key, value) {
  for (const fn of [...(listeners.get(key) || [])]) {
    try { fn(value); } catch (e) { console.warn('store listener failed', e); }
  }
}

// ===== LOCAL STORAGE =====
// Legacy pages persist through LS.set, so listeners also hear about their writes.
export const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { localStorage.setItem(k, JSON.stringify(v)); notify(k, v); },
};

// ===== NORMALISE (pure) =====
function fillRole(r) {
  if (!isObj(r)) return { value: r, changed: false };
  const out = { ...r };
  let changed = false;
  for (const [k, d] of Object.entries(ROLE_DEFAULTS)) {
    if (out[k] === undefined) { out[k] = d; changed = true; }
  }
  if (!Array.isArray(out.stageHistory)) { out.stageHistory = []; changed = true; }
  if (typeof out.jdComplete !== 'boolean') {
    // v1 kept only the first 500 characters; a JD at the cap (or missing) needs a "paste the full JD" prompt.
    out.jdComplete = typeof out.jd === 'string' && out.jd.length > 0 && out.jd.length < 500;
    changed = true;
  }
  return { value: changed ? out : r, changed };
}
function fillStory(s) {
  if (!isObj(s) || Array.isArray(s.roleIds)) return { value: s, changed: false };
  return { value: { ...s, roleIds: [] }, changed: true };
}
export const normalizeRole = r => fillRole(r).value;
export const normalizeStory = s => fillStory(s).value;

// ===== MIGRATION =====
function normalizeList(raw, fill) {
  if (raw == null) return { raw, changed: false };
  const p = parse(raw);
  if (!p.ok || !Array.isArray(p.value)) return { raw, changed: false }; // unparsable or foreign: untouched
  let changed = false;
  const list = p.value.map(x => { const f = fill(x); changed ||= f.changed; return f.value; });
  return changed ? { raw: JSON.stringify(list), changed } : { raw, changed };
}
const schemaOf = snap => { const p = parse(snap[SCHEMA_KEY]); return p.ok && typeof p.value === 'number' ? p.value : null; };

// Pure, on raw strings. Keys it does not change keep their exact string.
export function migrateData(snap) {
  const out = { ...snap };
  const schema = schemaOf(snap);
  if (schema !== null && schema > SCHEMA_VERSION) return { snap: out, changed: false }; // newer build wrote this: leave it
  const hasData = DATA_KEYS.some(k => snap[k] != null);
  if (!hasData) return { snap: out, changed: false }; // fresh visitor: nothing to write
  let changed = false;
  const pl = normalizeList(snap.co_pipeline, fillRole);
  if (pl.changed) { out.co_pipeline = pl.raw; changed = true; }
  const st = normalizeList(snap.co_stories, fillStory);
  if (st.changed) { out.co_stories = st.raw; changed = true; }
  if (schema !== SCHEMA_VERSION) { out[SCHEMA_KEY] = String(SCHEMA_VERSION); changed = true; }
  return { snap: out, changed };
}

function readSnap(storage, keys) {
  const snap = {};
  for (const k of keys) snap[k] = storage.getItem(k);
  return snap;
}

// Writes `next` (changed keys only, schema last). On any throw, restores what it wrote and rethrows.
function writeAll(storage, prev, next, keys) {
  const written = [];
  try {
    for (const k of keys) {
      if (next[k] === prev[k]) continue;
      written.push(k);
      if (next[k] == null) storage.removeItem(k); else storage.setItem(k, next[k]);
    }
  } catch (e) {
    for (const k of written.reverse()) {
      try { if (prev[k] == null) storage.removeItem(k); else storage.setItem(k, prev[k]); } catch { /* best effort */ }
    }
    throw e;
  }
}

// Snapshot the v1 data once, before the first write ever. Returns true if it was taken now.
function takeBackup(storage, snap) {
  if (storage.getItem(BACKUP_KEY) !== null) return false;
  const keys = {};
  for (const k of DATA_KEYS) keys[k] = snap[k] ?? null;
  storage.setItem(BACKUP_KEY, JSON.stringify({ takenAt: nowIso(), keys }));
  return true;
}

export function migrate(storage = defaultStorage()) {
  if (!storage) return { status: 'noop', backupTaken: false };
  const keys = [...DATA_KEYS, SCHEMA_KEY];
  let snap, res;
  try {
    snap = readSnap(storage, keys);
    res = migrateData(snap);
  } catch {
    return { status: 'skipped-quota', backupTaken: false };
  }
  if (!res.changed) return { status: 'noop', backupTaken: false };
  const status = schemaOf(snap) === SCHEMA_VERSION ? 'normalized' : 'migrated';
  let backupTaken = false;
  try {
    backupTaken = takeBackup(storage, snap);
    writeAll(storage, snap, res.snap, keys); // schema key is last in `keys`
  } catch {
    if (backupTaken) { try { storage.removeItem(BACKUP_KEY); } catch { /* ignore */ } }
    return { status: 'skipped-quota', backupTaken: false };
  }
  return { status, backupTaken };
}

// Runs before the reads below. Never throws: on failure the app keeps the v1 data as is.
export const migrationResult = migrate();

// ===== PIPELINE STATE =====
const asArray = v => (Array.isArray(v) ? v : []);
export let pipeline = asArray(LS.get('co_pipeline'));
export let stories = asArray(LS.get('co_stories'));
export let profile = LS.get('co_profile') || {};
// ES module bindings are read-only for importers; this is the only writer of `profile`.
export function setProfile(p) { profile = p; }

// ===== ROLES / STORIES (v2 helpers; mutate the shared arrays in place) =====
export function makeRole(evalData, jd) {
  const data = evalData || {};
  const at = nowIso();
  return {
    id: Date.now(),
    role: data.roleTitle || 'Unknown Role',
    company: data.company || 'Unknown Company',
    score: data.finalScore,
    grade: data.grade,
    match: data.matchPercent,
    archetype: data.archetype,
    location: data.jobLocation,
    status: 'researching',
    date: at,
    fullData: data,
    jd: typeof jd === 'string' ? jd : String(jd ?? ''),
    appliedAt: null,
    interviewAt: null,
    nextAction: null,
    nextActionAt: null,
    stageHistory: [{ status: 'researching', at }],
    jdComplete: true,
  };
}

const findRole = id => pipeline.find(r => isObj(r) && String(r.id) === String(id)) || null;
const savePipelineRaw = () => LS.set('co_pipeline', pipeline);

export function updateRole(id, patch) {
  const r = findRole(id);
  if (!r) return null;
  Object.assign(r, normalizeRole(r), patch || {});
  savePipelineRaw();
  return r;
}

export function setStage(id, status, at = nowIso()) {
  const r = findRole(id);
  if (!r) return null;
  Object.assign(r, normalizeRole(r));
  r.status = status;
  r.stageHistory = [...r.stageHistory, { status, at }];
  if (status === 'applied' && !r.appliedAt) r.appliedAt = at;
  savePipelineRaw();
  return r;
}

export function linkStory(storyId, roleId) {
  const s = stories.find(x => isObj(x) && String(x.id) === String(storyId));
  if (!s) return null;
  if (!Array.isArray(s.roleIds)) s.roleIds = [];
  if (!s.roleIds.some(x => String(x) === String(roleId))) s.roleIds.push(roleId);
  LS.set('co_stories', stories);
  return s;
}

// ===== BACKUP EXPORT / IMPORT (UI is Phase 3A) =====
export function exportAll(storage = defaultStorage()) {
  const get = k => { try { return JSON.parse(storage.getItem(k)); } catch { return null; } };
  const data = {
    co_profile: isObj(get('co_profile')) ? get('co_profile') : {},
    co_pipeline: asArray(get('co_pipeline')),
    co_stories: asArray(get('co_stories')),
  };
  const theme = get('co_theme');
  if (theme === 'light' || theme === 'dark') data.co_theme = theme;
  return { app: 'kairo', schema: SCHEMA_VERSION, exportedAt: nowIso(), data };
}

function validateImport(obj) {
  const errors = [];
  if (!isObj(obj)) return ['Not a Kairo backup (expected a JSON object).'];
  if (obj.app !== 'kairo') errors.push('Not a Kairo backup (missing app: "kairo").');
  if (typeof obj.schema !== 'number' || obj.schema < 1 || obj.schema > SCHEMA_VERSION) errors.push(`Unsupported schema: ${String(obj.schema)}.`);
  const d = obj.data;
  if (!isObj(d)) { errors.push('Missing data.'); return errors; }
  if (d.co_profile !== undefined && !isObj(d.co_profile)) errors.push('co_profile must be an object.');
  for (const k of ['co_pipeline', 'co_stories']) {
    if (d[k] === undefined) continue;
    if (!Array.isArray(d[k])) errors.push(`${k} must be a list.`);
    else d[k].forEach((x, i) => { if (!isObj(x)) errors.push(`${k}[${i}] must be an object.`); });
  }
  if (d.co_theme !== undefined && d.co_theme !== 'light' && d.co_theme !== 'dark') errors.push('co_theme must be "light" or "dark".');
  return errors;
}

export function importAll(obj, { dryRun = false, storage = defaultStorage() } = {}) {
  const errors = validateImport(obj);
  const counts = { profile: 0, roles: 0, stories: 0 };
  if (errors.length) return { ok: false, counts, errors };
  const d = obj.data;
  const incoming = {
    co_profile: JSON.stringify(d.co_profile || {}),
    co_pipeline: JSON.stringify(d.co_pipeline || []),
    co_stories: JSON.stringify(d.co_stories || []),
    [SCHEMA_KEY]: null,
  };
  const next = migrateData(incoming).snap;
  next[SCHEMA_KEY] = String(SCHEMA_VERSION);
  if (d.co_theme) next.co_theme = JSON.stringify(d.co_theme);
  counts.profile = Object.keys(d.co_profile || {}).length ? 1 : 0;
  counts.roles = (d.co_pipeline || []).length;
  counts.stories = (d.co_stories || []).length;
  if (dryRun) return { ok: true, counts, errors };
  if (!storage) return { ok: false, counts, errors: ['Storage is not available in this browser.'] };
  const keys = [...DATA_KEYS, ...(d.co_theme ? ['co_theme'] : []), SCHEMA_KEY];
  try {
    const prev = readSnap(storage, keys);
    const taken = takeBackup(storage, prev);
    try { writeAll(storage, prev, next, keys); } catch (e) {
      if (taken) { try { storage.removeItem(BACKUP_KEY); } catch { /* ignore */ } }
      throw e;
    }
  } catch {
    return { ok: false, counts, errors: ['Not enough browser storage to import this backup. Nothing was changed.'] };
  }
  // Refresh the live arrays in place so every importer sees the restored data.
  pipeline.splice(0, pipeline.length, ...JSON.parse(next.co_pipeline));
  stories.splice(0, stories.length, ...JSON.parse(next.co_stories));
  setProfile(JSON.parse(next.co_profile));
  notify('co_profile', profile);
  notify('co_pipeline', pipeline);
  notify('co_stories', stories);
  return { ok: true, counts, errors };
}

// ===== STORAGE METER (UI is Phase 3D) =====
export function storageUsage(storage = defaultStorage()) {
  const byKey = {};
  let usedBytes = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      const v = storage.getItem(k) ?? '';
      const b = (k.length + v.length) * 2; // UTF-16
      byKey[k] = b;
      usedBytes += b;
    }
  } catch { /* no storage: report zero */ }
  const ratio = usedBytes / QUOTA_BYTES;
  return { usedBytes, quotaBytes: QUOTA_BYTES, ratio, warn: ratio >= 0.8, byKey };
}
