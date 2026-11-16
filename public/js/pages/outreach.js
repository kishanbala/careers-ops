import { LS } from '../store.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';

// ===== OUTREACH =====
document.getElementById('outreach-run-btn').addEventListener('click', async () => {
  const jd = document.getElementById('outreach-jd').value.trim();
  const target = document.getElementById('outreach-target').value.trim();
  if (!jd) { showToast('Paste a job description or context.'); return; }
  const btn = document.getElementById('outreach-run-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Generating…';
  const p = LS.get('co_profile') || {};
  const content = jd + (target ? '\n\nReaching out to: ' + target : '');
  try {
    const res = await callAPI({ mode: 'contacto', content, cv: p.cv, profile: p });
    btn.disabled = false; btn.textContent = 'Regenerate';
    if (res.success && res.data) renderOutreachResult(res.data);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Generate Messages';
    showToast('Error: ' + e.message, 3000);
  }
});

export function renderOutreachResult(d) {
  const wrap = document.getElementById('outreach-result-wrap');
  wrap.style.display = 'block';
  document.getElementById('outreach-result-content').innerHTML = `
    ${d.connectionNote ? `<div class="neg-section"><div class="neg-label">Connection Note <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary)">${d.connectionNote.length}/300</span></div><div class="outreach-note">${esc(d.connectionNote)}</div><button class="btn btn-outline btn-sm outreach-copy-btn" style="margin-top:6px;">Copy</button></div>` : ''}
    ${d.inMailSubject ? `<div class="neg-section"><div class="neg-label">InMail Subject</div><div class="neg-body">${esc(d.inMailSubject)}</div></div>` : ''}
    ${d.inMailBody ? `<div class="neg-section"><div class="neg-label">InMail Body</div><div class="neg-email-wrap">${esc(d.inMailBody)}</div></div>` : ''}
    ${d.tips?.length ? `<div class="neg-section"><div class="neg-label">Tips</div>${d.tips.map(t=>`<div class="eval-block-body" style="margin-bottom:6px;">${esc(t)}</div>`).join('')}</div>` : ''}`;
  const copyBtn = document.querySelector('#outreach-result-content .outreach-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(String(d.connectionNote)).then(() => showToast('Copied ✓'));
  });
}
