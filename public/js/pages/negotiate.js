import { LS } from '../store.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';

// ===== NEGOTIATION =====
document.getElementById('neg-run-btn').addEventListener('click', async () => {
  const btn = document.getElementById('neg-run-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Generating…';
  const content = [
    'Scenario: ' + document.getElementById('neg-scenario').value,
    'Their offer: ' + document.getElementById('neg-offer').value,
    'Target: ' + document.getElementById('neg-target').value,
    'Competing offer: ' + document.getElementById('neg-competing').value,
    'Context: ' + document.getElementById('neg-ctx').value,
  ].join('\n');
  const p = LS.get('co_profile') || {};
  try {
    const res = await callAPI({ mode: 'negotiate', content, cv: p.cv, profile: p });
    btn.disabled = false; btn.textContent = 'Regenerate Script';
    if (res.success && res.data) renderNegResult(res.data);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Generate Script';
    showToast('Error: ' + e.message, 3000);
  }
});

export function renderNegResult(d) {
  const wrap = document.getElementById('neg-result-wrap');
  wrap.style.display = 'block';
  document.getElementById('neg-result-content').innerHTML = `
    ${['opening','anchor','fallback','close'].filter(k=>d[k]).map(k=>`<div class="neg-section"><div class="neg-label">${k.charAt(0).toUpperCase()+k.slice(1)}</div><div class="neg-body">${esc(d[k])}</div></div>`).join('')}
    ${d.crossBorderNotes ? `<div class="neg-section"><div class="neg-label">Cross-Border Notes</div><div class="neg-body">${esc(d.crossBorderNotes)}</div></div>` : ''}
    ${d.emailSubject ? `<div class="neg-section"><div class="neg-label">Email Draft</div><div class="neg-email-wrap"><div class="neg-subject">Subject: ${esc(d.emailSubject)}</div><div>${esc(d.emailBody || '')}</div></div></div>` : ''}
    ${d.tips?.length ? `<div class="neg-section"><div class="neg-label">Tips</div>${d.tips.map(t=>`<div class="eval-block-body" style="margin-bottom:6px;">${esc(t)}</div>`).join('')}</div>` : ''}`;
}
