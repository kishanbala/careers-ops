import { LS } from '../store.js';
import { callAPI } from '../api.js';
import { esc, safeUrl } from '../render/escape.js';
import { showToast } from '../render/toast.js';

// ===== SCAN =====
const defaultPortals = [
  { company: 'Anthropic', meta: 'Ashby · AI Safety', url: 'https://boards.greenhouse.io/anthropic' },
  { company: 'OpenAI', meta: 'Greenhouse · Research', url: 'https://openai.com/careers' },
  { company: 'ElevenLabs', meta: 'Ashby · Voice AI', url: 'https://jobs.ashbyhq.com/elevenlabs' },
  { company: 'Mistral AI', meta: 'Lever · Research', url: 'https://jobs.lever.co/mistralai' },
  { company: 'Retool', meta: 'Greenhouse · Platform', url: 'https://retool.com/careers' },
  { company: 'Vercel', meta: 'Greenhouse · Engineering', url: 'https://vercel.com/careers' },
];

function renderPortals() {
  document.getElementById('scan-portal-list').innerHTML = defaultPortals.map(p =>
    `<div class="portal-item">
      <div><div style="font-weight:600;">${p.company}</div><div class="portal-meta">${p.meta}</div></div>
      <span class="portal-status">Ready</span>
    </div>`
  ).join('');
}
renderPortals();

document.getElementById('scan-run-btn').addEventListener('click', async () => {
  const focus = document.getElementById('scan-focus').value.trim();
  const btn = document.getElementById('scan-run-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Scanning…';
  try {
    const p = LS.get('co_profile') || {};
    const res = await callAPI({ mode: 'scan', content: focus || 'Data analytics roles in Germany and Europe', profile: p });
    btn.disabled = false; btn.innerHTML = '⟳ Rescan';
    if (res.success && res.data?.results) {
      const rows = res.data.results.map(r =>
        `<tr><td style="font-weight:600;">${esc(r.role)}</td><td>${esc(r.company)}</td><td><span class="status-chip status-applied">${esc(r.portal)}</span></td><td>${safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">View →</a>` : ''}</td></tr>`
      ).join('');
      document.getElementById('scan-results-wrap').innerHTML = `<h2 class="card-title">Found Roles</h2><div style="overflow-x:auto;"><table class="pipeline-table"><thead><tr><th>Role</th><th>Company</th><th>Portal</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${res.data.summary ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:12px;">${esc(res.data.summary)}</p>` : ''}`;
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Retry Scan';
    showToast('Scan failed: ' + e.message, 3000);
  }
});
