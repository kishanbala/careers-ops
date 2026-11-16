import { LS } from '../store.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';
import { addToPipeline } from './evaluate.js';

// ===== BATCH =====
document.getElementById('batch-run-btn').addEventListener('click', async () => {
  const raw = document.getElementById('batch-jds').value.trim();
  if (!raw) { showToast('Paste job descriptions separated by ---'); return; }
  const jds = raw.split(/\n?---\n?/).map(s => s.trim()).filter(Boolean);
  if (jds.length === 0) { showToast('No descriptions found.'); return; }

  const btn = document.getElementById('batch-run-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Evaluating…';

  const results = [];
  const p = LS.get('co_profile') || {};
  for (const jd of jds) {
    try {
      const res = await callAPI({ mode: 'evaluate', content: jd, cv: p.cv, profile: p });
      if (res.success) results.push({ jd, data: res.data });
    } catch (_) {}
  }

  btn.disabled = false; btn.innerHTML = '⟳ Re-evaluate All';
  const wrap = document.getElementById('batch-results-wrap');
  wrap.style.display = 'block';
  const rows = results.map(r => {
    const d = r.data;
    const sc = d.finalScore || 0;
    const col = sc >= 4 ? 'var(--strong)' : sc >= 3 ? 'var(--review)' : 'var(--weak)';
    return `<tr>
      <td style="font-weight:600;">${esc(d.roleTitle || '—')}</td>
      <td>${esc(d.company || '—')}</td>
      <td><span style="font-family:var(--font-mono);font-weight:700;color:${col}">${sc.toFixed(1)}</span></td>
      <td>${esc(d.matchPercent || '—')}%</td>
      <td><button class="btn btn-outline btn-sm" data-batch-idx="${results.indexOf(r)}">+ Track</button></td>
    </tr>`;
  }).join('');
  document.getElementById('batch-results-body').innerHTML = rows;
  document.querySelectorAll('#batch-results-body [data-batch-idx]').forEach(b => b.addEventListener('click', () => addBatchEntry(parseInt(b.dataset.batchIdx))));
  batchResults = results;
});
let batchResults;
function addBatchEntry(idx) {
  const r = batchResults?.[idx];
  if (r) { addToPipeline(r.data, r.jd); showToast('Added to pipeline ✓'); }
}
