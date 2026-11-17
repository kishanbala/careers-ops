// Phase 3D Profile: pure helpers (no DOM, no storage), unit-tested in tests/view-profile.test.js.
export const MAX_CV_CHARS = 50000; // same cap as runTool / api/evaluate.js
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Short text fields in the order they are shown. `cv` is handled separately (long text, never trimmed).
export const TEXT_FIELDS = Object.freeze([
  { key: 'name', label: 'Name', autocomplete: 'name' },
  { key: 'title', label: 'Current title' },
  { key: 'location', label: 'Location', hint: 'City and country, or "remote".' },
  { key: 'target', label: 'Target role', hint: 'The kind of role you are after. Kairo scores every job against it.' },
  { key: 'salary', label: 'Salary expectation', hint: 'For example "EUR 85,000". Optional.' },
]);

const str = v => (typeof v === 'string' ? v : '');

// minscore is the user's apply line (1-5). Empty means "use the default 4.0". Stored as the trimmed text, like v1.
export function validateMinscore(v) {
  const t = str(v).trim();
  if (t === '') return { ok: true, value: '' };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 1 || n > 5) return { ok: false, error: 'Enter a number from 1.0 to 5.0, or leave it empty to use 4.0.' };
  return { ok: true, value: String(n) };
}

// values: the raw form values. Returns {ok, patch, errors}; patch only holds what the form owns, so other stored fields survive saveProfile's merge.
export function buildPatch(values) {
  const v = values && typeof values === 'object' ? values : {};
  const errors = {};
  const patch = {};
  for (const f of TEXT_FIELDS) patch[f.key] = str(v[f.key]).trim();
  patch.story = str(v.story).trim();
  patch.cv = str(v.cv);
  const m = validateMinscore(v.minscore);
  if (m.ok) patch.minscore = m.value; else errors.minscore = m.error;
  return { ok: Object.keys(errors).length === 0, patch, errors };
}

export function cvCount(text) {
  const chars = str(text).length;
  const over = chars > MAX_CV_CHARS;
  const n = chars.toLocaleString('en-GB');
  const cap = MAX_CV_CHARS.toLocaleString('en-GB');
  return {
    chars, over,
    label: over ? `${n} characters. Over the ${cap} limit: tools cannot read this much, so shorten it.` : `${n} of ${cap} characters`,
  };
}

// Returns a problem sentence for a chosen file, or null when it can be read.
export function pdfProblem(file) {
  if (!file || typeof file !== 'object') return 'No file chosen.';
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(str(file.name));
  if (!isPdf) return 'This is not a PDF. Choose a PDF file, or paste your CV text below.';
  if (typeof file.size === 'number' && file.size > MAX_PDF_BYTES) return 'This PDF is larger than 10 MB. Paste the CV text below instead.';
  return null;
}

export function fmtBytes(n) {
  const b = Number.isFinite(n) && n > 0 ? n : 0;
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const KEY_NAMES = { co_pipeline: 'Roles', co_stories: 'Stories', co_profile: 'Profile' };

// usage: storageUsage() from store.js. warn mirrors its 80% rule.
export function describeUsage(usage) {
  const u = usage && typeof usage === 'object' ? usage : {};
  const used = Number.isFinite(u.usedBytes) ? u.usedBytes : 0;
  const quota = Number.isFinite(u.quotaBytes) && u.quotaBytes > 0 ? u.quotaBytes : 5_000_000;
  const ratio = used / quota;
  const pct = Math.min(100, Math.round(ratio * 100));
  const by = u.byKey && typeof u.byKey === 'object' ? u.byKey : {};
  const parts = Object.entries(KEY_NAMES).map(([k, label]) => `${label} ${fmtBytes(by[k] || 0)}`);
  return {
    pct, warn: ratio >= 0.8, parts,
    text: `${fmtBytes(used)} of about ${fmtBytes(quota)} used (${pct}%)`,
    warnText: `Browser storage is ${pct}% full. Export a backup from Home so your data is safe, then free some space before it fills up.`,
  };
}
