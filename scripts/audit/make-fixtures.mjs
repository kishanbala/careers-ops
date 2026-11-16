// Turns an audit log (scripts/audit/run-audit.mjs) into sanitised API fixtures.
//   node scripts/audit/make-fixtures.mjs <OUT_DIR>/audit-log.json [tests/fixtures/api]
// One file per mode (first successful parsed reply), every observed `skills` shape for pdf,
// and a `{raw}` failure case (real if one was observed, otherwise the audit's mocked one, labelled).
import fs from 'node:fs';
import path from 'node:path';

const [logPath, outDir = 'tests/fixtures/api'] = process.argv.slice(2);
const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const EMAIL = /[\w.+-]+@(?![\w-]+\.invalid\b)[\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?\d[\d ()-]{8,}\d/g;
const scrub = (v) => JSON.parse(JSON.stringify(v).replace(EMAIL, 'redacted@example.invalid').replace(PHONE, '<phone-redacted>'));
const req = (p) => ({
  mode: p?.mode,
  content: p?.content?.length > 400 ? `<${p.content.length} chars from tests/fixtures/synthetic-profile.json>` : p?.content,
  cv: p?.cv ? '<synthetic CV from tests/fixtures/synthetic-profile.json>' : p?.cv ?? null,
  profile: p?.profile && Object.keys(p.profile).length ? '<synthetic profile from tests/fixtures/synthetic-profile.json>' : p?.profile ?? null,
});
const write = (name, c, note) => {
  const f = { _label: 'SYNTHETIC — sanitised response captured from the live app during the v1 behaviour audit', _note: note, capturedAt: c.t, latencyMs: c.ms, httpStatus: c.status, mocked: !!c.mocked, request: req(c.payload), response: scrub(c.response) };
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(f, null, 2) + '\n');
  console.log('wrote', name);
};

const real = log.calls.filter((c) => !c.mocked && c.status === 200 && c.response?.success);
for (const mode of ['evaluate', 'pdf', 'research', 'negotiate', 'story', 'scan', 'contacto']) {
  const c = real.find((x) => x.mode === mode && !x.response.data?.raw) || real.find((x) => x.mode === mode);
  if (c) write(`${mode}.json`, c, c.response.data?.raw ? 'Only {raw} replies were observed for this mode.' : 'First successful parsed reply.');
  else console.log('no successful reply for', mode);
}
const shape = (s) => (s == null ? null : typeof s === 'string' ? 'string' : Array.isArray(s) ? 'string-array' : 'object');
const seen = new Set();
for (const c of real.filter((x) => x.mode === 'pdf')) {
  const s = shape(c.response.data?.skills);
  if (s && !seen.has(s)) { seen.add(s); write(`pdf-skills-${s}.json`, c, `pdf reply whose skills field is a ${s}.`); }
}
const rawReal = log.calls.find((c) => !c.mocked && c.response?.data?.raw);
const rawMock = log.calls.find((c) => c.mocked === true && c.response?.data?.raw);
if (rawReal) write('raw-failure.json', rawReal, 'Real {success:true,data:{raw}} reply (model output was not parseable JSON).');
else if (rawMock) write('raw-failure.json', rawMock, 'No real {raw} reply was observed; this is the mocked shape the audit injected (matches api/evaluate.js catch branch).');
