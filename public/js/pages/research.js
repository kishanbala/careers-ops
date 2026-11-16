import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';

// ===== COMPANY RESEARCH =====
document.getElementById('research-run-btn').addEventListener('click', async () => {
  const company = document.getElementById('research-company').value.trim();
  if (!company) { showToast('Enter a company name.'); return; }
  const btn = document.getElementById('research-run-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Researching…';
  try {
    const res = await callAPI({ mode: 'research', content: 'Research: ' + company });
    btn.disabled = false; btn.textContent = 'Research';
    if (res.success && res.data) renderResearchResult(res.data);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Research';
    showToast('Error: ' + e.message, 3000);
  }
});

export function renderResearchResult(d) {
  const wrap = document.getElementById('research-result-wrap');
  wrap.style.display = 'block';
  document.getElementById('research-result-content').innerHTML = `
    <div style="display:flex;gap:20px;align-items:center;margin-bottom:16px;flex-wrap:wrap;">
      <div><div style="font-size:20px;font-weight:800;">${esc(d.company)}</div><div style="font-size:13px;color:var(--text-secondary);">${esc(d.stage || '')} · ${esc(d.headcount || '')}</div></div>
      ${d.aiScore ? `<div style="margin-left:auto;background:var(--nav-bg);color:var(--text-on-dark);border-radius:8px;padding:8px 16px;font-family:var(--font-mono);font-size:20px;font-weight:700;">${esc(d.aiScore)}</div>` : ''}
    </div>
    <div class="research-grid">
      ${['overview','culture','techStack','interviewProcess','compensation','redFlags'].filter(k=>d[k]).map(k=>`<div class="research-block"><div class="research-block-label">${k.replace(/([A-Z])/g,' $1').trim()}</div><div class="research-block-val">${esc(d[k])}</div></div>`).join('')}
    </div>
    ${d.verdict ? `<div style="margin-top:16px;background:var(--nav-bg);color:var(--text-on-dark);border-radius:var(--radius);padding:16px;font-size:14px;line-height:1.7;"><strong style="color:var(--accent);">Verdict</strong><br>${esc(d.verdict)}</div>` : ''}`;
}
