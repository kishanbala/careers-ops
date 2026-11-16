// Kairo behaviour audit (Phase 0A, issue #4). Re-runnable against any build:
//   BASE_URL=https://www.kairoapp.eu node scripts/audit/run-audit.mjs
// Env: BASE_URL (required target), OUT_DIR (logs, default ./audit-out), SHOT_DIR (default docs/audit/v1),
//      MAX_API_CALLS (hard cap on real /api/evaluate calls, default 40), PHASES (comma list: desktop,empty,responsive).
// Needs Playwright: `npm i --no-save playwright && npx playwright install chromium` (never add it to package.json).
// Uses only tests/fixtures/synthetic-profile.json (SYNTHETIC — not a real person).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('playwright');

const BASE_URL = (process.env.BASE_URL || 'https://www.kairoapp.eu').replace(/\/$/, '');
const OUT = process.env.OUT_DIR || 'audit-out';
const SHOTS = process.env.SHOT_DIR || 'docs/audit/v1';
const MAX = Number(process.env.MAX_API_CALLS || 40);
const DRY = process.env.DRY_RUN === '1'; // canned replies, zero API cost (for debugging the script)
const DRY_DATA = {
  evaluate: { roleTitle: 'Dry Role', company: 'Dry Co', finalScore: 3.4, grade: 'B', matchPercent: 60, dimensions: { roleImpact: 3, cvMatch: 4 }, blocks: { roleSummary: 'dry' }, gaps: [] },
  pdf: { name: 'Dry', summary: 'dry', experience: [{ role: 'R', company: 'C', bullets: ['b'] }], skills: ['SQL'] },
  story: { question: 'Dry q', situation: 's', task: 't', action: 'a', result: 'r', reflection: 'x', tags: ['dry'] },
  scan: { results: [{ role: 'R', company: 'C', portal: 'P', url: 'https://example.invalid' }], summary: 'dry' },
  negotiate: { opening: 'o', anchor: 'a', fallback: 'f', close: 'c', tips: ['t'] },
  research: { company: 'Dry', overview: 'o', verdict: 'v' },
  contacto: { connectionNote: 'Hi', inMailSubject: 's', inMailBody: 'b', tips: ['t'] },
};
const PHASES = (process.env.PHASES || 'desktop,empty,responsive').split(',');
const FX = JSON.parse(fs.readFileSync('tests/fixtures/synthetic-profile.json', 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const calls = [];   // every /api/evaluate request seen by the browser (real + mocked)
const steps = [];   // per-feature results
const mocks = [];   // queue of {mode, status, body} to fulfil instead of hitting the API
let realCalls = 0;
const save = () => fs.writeFileSync(path.join(OUT, 'audit-log.json'), JSON.stringify({ BASE_URL, realCalls, steps, calls }, null, 2));

async function newContext(browser, width, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await ctx.route('**/api/evaluate', async (route) => {
    const req = route.request();
    let payload = null;
    try { payload = JSON.parse(req.postData() || 'null'); } catch {}
    const mode = payload?.mode;
    const rec = { idx: calls.length, mode, payload, t: new Date().toISOString() };
    calls.push(rec);
    const mi = mocks.findIndex((m) => !m.mode || m.mode === mode);
    if (mi !== -1) {
      const m = mocks.splice(mi, 1)[0];
      Object.assign(rec, { mocked: true, status: m.status, response: m.body, ms: 0 });
      save();
      return route.fulfill({ status: m.status, contentType: 'application/json', body: JSON.stringify(m.body) });
    }
    if (DRY) {
      Object.assign(rec, { mocked: 'dry', status: 200, ms: 0 }); save();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: DRY_DATA[mode] || { raw: 'dry' }, mode }) });
    }
    if (realCalls >= MAX) { rec.blocked = 'MAX_API_CALLS reached'; save(); return route.abort(); }
    realCalls++;
    const t0 = Date.now();
    try {
      const resp = await route.fetch({ timeout: 120000 });
      const text = await resp.text();
      rec.ms = Date.now() - t0; rec.status = resp.status();
      try { rec.response = JSON.parse(text); } catch { rec.response = { _nonJson: text.slice(0, 2000) }; }
      save();
      return route.fulfill({ response: resp, body: text });
    } catch (e) {
      rec.ms = Date.now() - t0; rec.error = e.message; save();
      return route.abort();
    }
  });
  return ctx;
}

async function step(id, page, fn) {
  const errs = [];
  const onC = (m) => { if (m.type() === 'error') errs.push(m.text()); };
  const onE = (e) => errs.push('pageerror: ' + e.message);
  page.on('console', onC); page.on('pageerror', onE);
  const first = calls.length; const t0 = Date.now();
  const rec = { id, viewport: page.viewportSize().width };
  try { rec.data = await fn(); rec.ok = true; } catch (e) { rec.ok = false; rec.error = e.message.split('\n')[0]; }
  page.off('console', onC); page.off('pageerror', onE);
  Object.assign(rec, { ms: Date.now() - t0, consoleErrors: errs, calls: calls.slice(first).map((c) => c.idx) });
  steps.push(rec); save();
  console.log(`${rec.ok ? 'ok ' : 'ERR'} ${id} ${rec.error || ''} (real calls: ${realCalls})`);
  return rec;
}

const shot = (page, name, full = true) => page.screenshot({ path: path.join(SHOTS, `${name}-${page.viewportSize().width}.png`), fullPage: full });
const go = (page, id) => page.evaluate((p) => navigateTo(p), id);
const ls = (page, k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const toast = async (page) => ((await page.locator('#toast.show').count()) ? page.locator('#toast').textContent() : null);
async function waitBtn(page, id) {
  await page.waitForTimeout(300);
  await page.waitForFunction((i) => !document.getElementById(i).disabled, id, { timeout: 300000 });
}
async function waitEval(page) {
  await page.waitForFunction(() => getComputedStyle(document.getElementById('eval-loading-state')).display === 'none', null, { timeout: 300000 });
}
async function runEval(page, jd, mode) {
  await go(page, 'evaluate');
  if (await visible(page, '#eval-new-btn')) await page.click('#eval-new-btn');
  await page.click(`#eval-mode-chips .chip[data-mode="${mode}"]`);
  await page.fill('#eval-jd', jd);
  const t0 = Date.now();
  await page.click('#eval-run-btn');
  await page.waitForTimeout(2500);
  const timer = await page.locator('#eval-timer').textContent();
  const loadingShown = await visible(page, '#eval-loading-state');
  await waitEval(page);
  const resultShown = await visible(page, '#eval-result-state');
  return {
    uiMs: Date.now() - t0, timerAt2_5s: timer, loadingShown, resultShown, toast: resultShown ? null : await toast(page),
    dims: await page.$$eval('#eval-dims-wrap .dim-row', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' '))),
    blocks: await page.$$eval('#eval-blocks-wrap .eval-block-title', (r) => r.map((x) => x.innerText)),
    header: (await page.locator('#eval-result-header').innerText().catch(() => '')).replace(/\s+/g, ' '),
    addBtnVisible: await visible(page, '#eval-add-btn'),
  };
}
const lastResp = () => [...calls].reverse().find((c) => !c.mocked)?.response;

async function desktop(browser) {
  const ctx = await newContext(browser, 1440);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  await step('NAV-01', page, async () => {
    await shot(page, 'NAV-01', false);
    return { topNav: await page.$$eval('.top-nav .nav-item', (n) => n.filter((x) => x.offsetParent).map((x) => x.dataset.page)) };
  });
  await step('DASH-07', page, async () => { await shot(page, 'DASH-07'); return { empty: await visible(page, '#pipeline-table-wrap .empty-state') }; });
  await step('DASH-06', page, async () => {
    await page.click('#grade-guide-btn');
    const open = await visible(page, '#grade-legend-panel');
    await shot(page, 'DASH-06');
    await page.click('#grade-guide-btn');
    return { opensOnFirstClick: open, closesOnSecond: !(await visible(page, '#grade-legend-panel')) };
  });

  // Profile
  const pdfPath = path.resolve(OUT, 'synthetic-cv.pdf');
  const pp = await ctx.newPage();
  await pp.setContent(`<pre style="font:12px sans-serif;white-space:pre-wrap">${FX.profile.cv.replace(/</g, '&lt;')}</pre>`);
  await pp.pdf({ path: pdfPath, format: 'A4' }); await pp.close();
  await go(page, 'profile');
  await step('PROF-01', page, async () => {
    const p = FX.profile;
    for (const [k, v] of Object.entries({ name: p.name, title: p.title, location: p.location, salary: p.salary, minscore: p.minscore, story: p.story })) await page.fill('#p-' + k, v);
    await page.selectOption('#p-target', { label: p.target });
    return { fields: await page.$$eval('#page-profile input, #page-profile select, #page-profile textarea', (e) => e.map((x) => x.id)) };
  });
  await step('PROF-02', page, async () => {
    await page.setInputFiles('#cv-file-input', pdfPath);
    await page.waitForFunction(() => document.getElementById('p-cv').value.length > 50, null, { timeout: 30000 });
    const v = await page.inputValue('#p-cv');
    await shot(page, 'PROF-02');
    return { extractedChars: v.length, containsLead: v.includes('Lead Data Analyst'), toast: await toast(page) };
  });
  await step('PROF-03', page, async () => { await page.fill('#p-cv', FX.profile.cv); return { chars: (await page.inputValue('#p-cv')).length }; });
  await step('PROF-04', page, async () => { await page.click('#save-profile-btn'); return { toast: await toast(page), saved: await ls(page, 'co_profile') !== null }; });
  await step('PROF-05', page, async () => {
    await page.reload({ waitUntil: 'networkidle' }); await go(page, 'profile');
    const got = await page.evaluate(() => Object.fromEntries(['name', 'title', 'location', 'target', 'salary', 'minscore', 'story', 'cv'].map((k) => [k, document.getElementById('p-' + k).value])));
    const p = FX.profile;
    return { mismatched: Object.keys(got).filter((k) => got[k] !== p[k]) };
  });

  // Evaluate
  await step('EVAL-01', page, async () => {
    const r = await runEval(page, FX.jds.standard, 'full');
    await shot(page, 'EVAL-01');
    return { ...r, pipelineLen: (await ls(page, 'co_pipeline'))?.length };
  });
  await step('EVAL-07', page, async () => {
    await page.click('#eval-go-cv-btn');
    return { cvPageActive: await visible(page, '#page-cv'), jdCarried: (await page.inputValue('#cv-jd')) === FX.jds.standard };
  });
  await step('EVAL-08', page, async () => {
    await go(page, 'evaluate'); await page.click('#eval-go-stories-btn');
    return { storiesPageActive: await visible(page, '#page-stories') };
  });
  await step('EVAL-09', page, async () => {
    await go(page, 'evaluate'); await page.click('#eval-new-btn');
    return { inputShown: await visible(page, '#eval-input-state'), jdCleared: (await page.inputValue('#eval-jd')) === '' };
  });
  await step('EVAL-02', page, async () => {
    const before = (await ls(page, 'co_pipeline'))?.length || 0;
    const r = await runEval(page, FX.jds.quick, 'quick');
    const afterRun = (await ls(page, 'co_pipeline'))?.length || 0;
    await shot(page, 'EVAL-02');
    let afterAdd = afterRun;
    if (r.addBtnVisible) { await page.click('#eval-add-btn'); afterAdd = (await ls(page, 'co_pipeline')).length; }
    return { ...r, before, afterRun, afterAdd, toast: await toast(page) };
  });
  await step('EVAL-10', page, async () => { const r = await runEval(page, FX.jds.long, 'quick'); await shot(page, 'EVAL-10'); return { ...r, jdChars: FX.jds.long.length }; });
  await step('EVAL-11', page, async () => { const r = await runEval(page, FX.jds.injection, 'quick'); await shot(page, 'EVAL-11'); return r; });

  // Dashboard with data
  await go(page, 'dashboard');
  await step('DASH-01', page, async () => {
    await shot(page, 'DASH-01');
    return Object.fromEntries(await page.$$eval('.stat-card', (c) => c.map((x) => [x.querySelector('.stat-label').innerText, x.querySelector('.stat-value').innerText])));
  });
  await step('DASH-02', page, async () => ({ rows: await page.$$eval('.pipeline-table tbody tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' '))) }));
  await step('DASH-03', page, async () => {
    await page.click('.pipeline-table tbody tr td >> nth=0');
    await page.waitForSelector('#pipeline-modal.open');
    const r = { gauge: await page.locator('#pipeline-modal .gauge-svg').count(), bars: await page.locator('#pipeline-modal .dim-row').count(), blocks: await page.$$eval('#pipeline-modal .eval-block-title', (b) => b.map((x) => x.innerText)) };
    await shot(page, 'DASH-03', false);
    await page.click('#pipeline-modal-close');
    return r;
  });
  await step('DASH-04', page, async () => {
    await page.selectOption('.status-sel >> nth=0', { label: 'Applied' });
    await page.reload({ waitUntil: 'networkidle' });
    return { stored: (await ls(page, 'co_pipeline'))[0].status, shown: await page.locator('.status-sel >> nth=0').inputValue(), active: await page.locator('#stat-active').innerText() };
  });
  await step('DASH-05', page, async () => {
    const inTable = await page.locator('#pipeline-table-wrap :text-matches("delete|remove", "i")').count();
    await page.click('.pipeline-table tbody tr td >> nth=0'); await page.waitForSelector('#pipeline-modal.open');
    const inModal = await page.locator('#pipeline-modal :text-matches("delete|remove", "i")').count();
    await page.click('#pipeline-modal-close');
    return { deleteControls: inTable + inModal };
  });

  // Find Jobs
  await go(page, 'scan');
  await step('SCAN-03', page, async () => ({ portals: await page.$$eval('#scan-portal-list .portal-item', (p) => p.map((x) => x.innerText.split('\n')[0])) }));
  const scan = async (id, focus) => step(id, page, async () => {
    await page.reload({ waitUntil: 'networkidle' }); await go(page, 'scan');
    await page.fill('#scan-focus', focus); await page.click('#scan-run-btn'); await waitBtn(page, 'scan-run-btn');
    await shot(page, id);
    const c = calls[calls.length - 1];
    return { rows: await page.locator('#scan-results-wrap tbody tr').count(), btn: await page.innerText('#scan-run-btn'), sentCv: !!c?.payload?.cv, sentContent: c?.payload?.content, respKeys: Object.keys(c?.response?.data || {}), toast: await toast(page) };
  });
  await scan('SCAN-01', 'Analytics Engineer, Netherlands or Germany, hybrid');
  await scan('SCAN-02', '');

  // Batch
  await go(page, 'batch');
  await step('BATCH-01', page, async () => {
    await page.fill('#batch-jds', FX.jds.batch.join('\n---\n'));
    await page.click('#batch-run-btn'); await waitBtn(page, 'batch-run-btn');
    await shot(page, 'BATCH-01');
    const before = (await ls(page, 'co_pipeline')).length;
    const rows = await page.$$eval('#batch-results-body tr', (r) => r.map((x) => x.innerText.replace(/\s+/g, ' ')));
    if (rows.length) await page.click('#batch-results-body tr >> nth=0 >> button');
    return { jds: FX.jds.batch.length, rows, trackAdded: (await ls(page, 'co_pipeline')).length - before };
  });

  // My CV
  const genCv = (id, jd, arch) => step(id, page, async () => {
    await go(page, 'cv'); await page.fill('#cv-jd', jd); await page.selectOption('#cv-archetype', { label: arch });
    await page.click('#cv-gen-btn'); await waitBtn(page, 'cv-gen-btn');
    await shot(page, id);
    const c = calls[calls.length - 1]; const d = c?.response?.data || {};
    const sk = d.skills;
    return {
      shown: await visible(page, '#cv-result-wrap'), payloadKeys: Object.keys(c?.payload || {}), archetypeSent: Object.entries(c?.payload || {}).some(([k, v]) => k !== 'profile' && JSON.stringify(v).includes(arch)),
      skillsShape: sk == null ? 'none' : typeof sk === 'string' ? 'string' : Array.isArray(sk) ? 'string[]' : 'object',
      respKeys: Object.keys(d), contactLine: await page.locator('#cv-styled-preview .cv-preview-content > div:first-child > div:nth-child(3)').innerText().catch(() => null),
      sections: await page.$$eval('#cv-styled-preview .cv-preview-content > div:nth-child(2) > div', (x) => x.map((s) => s.innerText.split('\n')[0])),
    };
  });
  await genCv('CV-01', FX.jds.standard, 'Analytics Engineer');
  await step('CV-04', page, async () => {
    await page.click('#page-cv .tab-btn[data-tab="copy"]');
    const btns = await page.$$eval('.copy-section-btn', (b) => b.map((x) => x.innerText.split('\n')[0]));
    await page.click('.copy-section-btn >> nth=0');
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
    await shot(page, 'CV-04', false);
    await page.click('#page-cv .tab-btn[data-tab="preview"]');
    return { buttons: btns, clipboardChars: clip.length, label: await page.locator('.copy-section-btn >> nth=0').innerText() };
  });
  await step('CV-05', page, async () => {
    const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), page.click('#cv-dl-btn')]);
    await popup.waitForLoadState().catch(() => {});
    const html = await popup.content(); await popup.close().catch(() => {});
    return { popupOpened: true, popupHasCv: html.includes('cv-preview-content'), chars: html.length };
  });
  await step('CV-06', page, async () => {
    const pages = ctx.pages().length; const htmlBefore = await page.content();
    await page.click('#cv-fullscreen-btn'); await page.waitForTimeout(800);
    return { newWindow: ctx.pages().length > pages, domChanged: (await page.content()) !== htmlBefore };
  });
  await genCv('CV-02', FX.jds.quick, 'Data Analyst');

  // Interview Stories
  await go(page, 'stories');
  await step('STORY-01', page, async () => {
    const before = (await ls(page, 'co_stories'))?.length || 0;
    await page.fill('#story-q', FX.story.question); await page.fill('#story-ctx', FX.story.ctx);
    await page.click('#story-gen-btn'); await waitBtn(page, 'story-gen-btn');
    await shot(page, 'STORY-01');
    const c = calls[calls.length - 1];
    return { before, after: (await ls(page, 'co_stories'))?.length || 0, cards: await page.locator('.story-card').count(), badge: await page.innerText('#sb-stories-badge'), rawReply: !!c?.response?.data?.raw, respKeys: Object.keys(c?.response?.data || {}), toast: await toast(page) };
  });
  await step('STORY-03', page, async () => {
    if (!(await page.locator('.story-card').count())) throw new Error('no story card to open');
    await page.click('.story-card >> nth=0'); await page.waitForSelector('#story-modal.open');
    const txt = await page.innerText('#story-modal-content');
    await shot(page, 'STORY-03', false);
    return { sections: await page.$$eval('#story-modal .eval-block-title', (b) => b.map((x) => x.innerText)), confirmTags: (txt.match(/\[confirm\]/gi) || []).length, chars: txt.length };
  });
  await step('STORY-02', page, async () => { // {raw} reply, mocked: no API cost
    await page.click('#story-modal-close').catch(() => {});
    mocks.push({ mode: 'story', status: 200, body: { success: true, data: { raw: 'SYNTHETIC mocked prose reply that is not JSON.' }, mode: 'story' } });
    const before = (await ls(page, 'co_stories'))?.length || 0;
    await page.fill('#story-q', 'Mocked raw-reply check'); await page.click('#story-gen-btn'); await waitBtn(page, 'story-gen-btn');
    const st = await ls(page, 'co_stories');
    await page.click('.story-card >> nth=0'); await page.waitForSelector('#story-modal.open');
    const modalText = (await page.innerText('#story-modal-content')).trim();
    await shot(page, 'STORY-02', false);
    await page.click('#story-modal-close');
    return { before, after: st.length, newCardTitle: await page.locator('.story-card >> nth=0 >> .story-q').innerText(), stored: st[0], modalText, toast: await toast(page) };
  });
  await step('STORY-04', page, async () => {
    const before = (await ls(page, 'co_stories')).length;
    await page.click('.story-card >> nth=0'); await page.waitForSelector('#story-modal.open');
    await page.click('#story-modal-content button:has-text("Delete")');
    return { before, after: (await ls(page, 'co_stories')).length, badge: await page.innerText('#sb-stories-badge'), toast: await toast(page) };
  });
  await step('STORY-05', page, async () => ({ cancelHasHandler: false, note: 'checked in code: #story-cancel-btn has no listener', badgeVisibleAtDesktop: await visible(page, '#sb-stories-badge') }));

  // Negotiation: every scenario
  await go(page, 'negotiate');
  const scen = await page.$$eval('#neg-scenario option', (o) => o.map((x) => x.textContent));
  for (const [i, s] of scen.entries()) {
    await step(`NEG-0${i + 1}`, page, async () => {
      await page.selectOption('#neg-scenario', { label: s });
      await page.fill('#neg-offer', FX.negotiate.offer); await page.fill('#neg-target', FX.negotiate.target);
      await page.fill('#neg-competing', FX.negotiate.competing); await page.fill('#neg-ctx', FX.negotiate.ctx);
      await page.click('#neg-run-btn'); await waitBtn(page, 'neg-run-btn');
      await shot(page, `NEG-0${i + 1}`);
      const c = calls[calls.length - 1];
      return { scenario: s, sections: await page.$$eval('#neg-result-content .neg-label', (l) => l.map((x) => x.innerText)), raw: !!c?.response?.data?.raw, toast: await toast(page) };
    });
  }

  // Company research
  await go(page, 'research');
  await step('RES-01', page, async () => {
    await page.fill('#research-company', FX.research_company); await page.click('#research-run-btn'); await waitBtn(page, 'research-run-btn');
    await shot(page, 'RES-01');
    const c = calls[calls.length - 1];
    return { shown: await visible(page, '#research-result-wrap'), labels: await page.$$eval('.research-block-label', (l) => l.map((x) => x.innerText)), sentProfile: !!c?.payload?.profile, sentCv: !!c?.payload?.cv, raw: !!c?.response?.data?.raw };
  });

  // Outreach
  await go(page, 'outreach');
  await step('OUT-01', page, async () => {
    await page.fill('#outreach-jd', FX.jds.standard); await page.fill('#outreach-target', FX.outreach.target);
    await page.click('#outreach-run-btn'); await waitBtn(page, 'outreach-run-btn');
    await shot(page, 'OUT-01');
    const d = calls[calls.length - 1]?.response?.data || {};
    return { labels: await page.$$eval('#outreach-result-content .neg-label', (l) => l.map((x) => x.innerText)), noteLen: d.connectionNote?.length, raw: !!d.raw };
  });
  await step('OUT-02', page, async () => {
    if (!(await page.locator('#outreach-result-content button:has-text("Copy")').count())) throw new Error('no Copy button');
    await page.click('#outreach-result-content button:has-text("Copy")'); await page.waitForTimeout(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
    return { clipboardChars: clip.length, toast: await toast(page) };
  });

  await go(page, 'strategy');
  await step('STRAT-01', page, async () => { await shot(page, 'STRAT-01', false); return { text: (await page.innerText('#page-strategy')).slice(0, 120) }; });

  // Cross-cutting (mocked: no API cost)
  await step('XC-TOAST', page, async () => {
    await go(page, 'evaluate'); if (await visible(page, '#eval-new-btn')) await page.click('#eval-new-btn');
    await page.fill('#eval-jd', ''); await page.click('#eval-run-btn'); await page.waitForTimeout(200);
    await shot(page, 'XC-TOAST', false);
    return { toast: await toast(page), shown: await page.locator('#toast.show').count() };
  });
  await step('XC-429', page, async () => {
    for (let i = 0; i < 3; i++) mocks.push({ mode: 'evaluate', status: 429, body: { error: 'rate_limited' } });
    const first = calls.length; const r = await runEval(page, FX.jds.quick, 'quick');
    return { attempts: calls.length - first, toast: r.toast, uiMs: r.uiMs };
  });
  await step('XC-500', page, async () => {
    for (let i = 0; i < 3; i++) mocks.push({ mode: 'evaluate', status: 500, body: { error: 'API call failed', message: 'mocked' } });
    const first = calls.length; const r = await runEval(page, FX.jds.quick, 'quick');
    return { attempts: calls.length - first, toast: r.toast };
  });
  await step('XC-RAW-EVAL', page, async () => {
    mocks.push({ mode: 'evaluate', status: 200, body: { success: true, data: { raw: 'SYNTHETIC mocked prose reply that is not JSON.' }, mode: 'evaluate', truncated: true } });
    const before = (await ls(page, 'co_pipeline')).length;
    const r = await runEval(page, FX.jds.quick, 'full');
    await shot(page, 'XC-RAW-EVAL');
    const pl = await ls(page, 'co_pipeline');
    return { ...r, before, after: pl.length, newEntry: { role: pl[0].role, company: pl[0].company, score: pl[0].score ?? null, grade: pl[0].grade ?? null } };
  });
  await step('XC-RAW-SCAN', page, async () => {
    mocks.push({ mode: 'scan', status: 200, body: { success: true, data: { raw: 'SYNTHETIC mocked prose reply.' }, mode: 'scan' } });
    await page.reload({ waitUntil: 'networkidle' }); await go(page, 'scan');
    await page.click('#scan-run-btn'); await waitBtn(page, 'scan-run-btn');
    return { rows: await page.locator('#scan-results-wrap tbody tr').count(), toast: await toast(page), portalsStillShown: await page.locator('#scan-portal-list .portal-item').count() };
  });

  fs.writeFileSync(path.join(OUT, 'desktop-localstorage.json'), JSON.stringify(await page.evaluate(() => ({ ...localStorage })), null, 2));
  await ctx.close();
}

async function empty(browser) {
  const ctx = await newContext(browser, 1440);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await step('XC-EMPTY', page, async () => {
    const r = await runEval(page, FX.jds.standard, 'quick');
    await shot(page, 'XC-EMPTY');
    const c = calls[calls.length - 1];
    return { ...r, sentCv: c?.payload?.cv ?? null, sentProfile: c?.payload?.profile ?? null };
  });
  await ctx.close();
}

async function responsive(browser) {
  let seed = {};
  try { seed = JSON.parse(fs.readFileSync(path.join(OUT, 'desktop-localstorage.json'), 'utf8')); } catch {}
  const pages = ['dashboard', 'evaluate', 'scan', 'batch', 'cv', 'stories', 'negotiate', 'research', 'outreach', 'strategy', 'profile'];
  for (const w of [1440, 820, 390]) {
    const ctx = await newContext(browser, w, w === 390 ? 844 : 1000);
    await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, seed);
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await step(`XC-NAV-${w}`, page, async () => {
      const navs = await page.evaluate(() => Object.fromEntries(['.top-nav', '.sidebar', '.mobile-bottom-nav'].map((s) => [s, getComputedStyle(document.querySelector(s)).display])));
      const reachable = await page.$$eval('.top-nav .nav-item, .sidebar .nav-item, .mobile-bottom-nav .mobile-tab', (n) => [...new Set(n.filter((x) => x.offsetParent || getComputedStyle(x).position === 'fixed').filter((x) => x.getClientRects().length).map((x) => x.dataset.page))]);
      await shot(page, 'XC-NAV', false);
      const overflow = {};
      for (const p of pages) { await go(page, p); overflow[p] = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }
      await go(page, 'evaluate');
      await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('co_pipeline') || '[]')[0]?.fullData; if (d) { evalMode = 'quick'; renderEvalResult(d); } });
      await shot(page, 'XC-EVAL-RESULT');
      await go(page, 'dashboard');
      await page.click('#grade-guide-btn'); await shot(page, 'XC-GRADE');
      return { navs, reachable, unreachable: pages.filter((p) => !reachable.includes(p)), horizontalOverflowPx: overflow };
    });
    await ctx.close();
  }
}

const browser = await chromium.launch();
try {
  if (PHASES.includes('desktop')) await desktop(browser);
  if (PHASES.includes('empty')) await empty(browser);
  if (PHASES.includes('responsive')) await responsive(browser);
} finally {
  await browser.close(); save();
  console.log(`done. real API calls: ${realCalls}, steps: ${steps.length}`);
}
