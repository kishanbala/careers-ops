import { LS } from '../store.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';

// ===== MY CV =====
let lastCVData = null;

document.getElementById('cv-gen-btn').addEventListener('click', async () => {
  const jd = document.getElementById('cv-jd').value.trim();
  if (!jd) { showToast('Paste a job description first.'); return; }
  const btn = document.getElementById('cv-gen-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Generating…';
  const p = LS.get('co_profile') || {};
  try {
    const res = await callAPI({ mode: 'pdf', content: jd, cv: p.cv, profile: p });
    btn.disabled = false; btn.textContent = 'Regenerate CV';
    if (res.success && res.data) {
      lastCVData = res.data;
      renderCVPreview(res.data);
      document.getElementById('cv-result-wrap').style.display = 'block';
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Generate Tailored CV';
    showToast('CV generation failed: ' + e.message, 3000);
  }
});

// CV tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabGroup = btn.closest('.tab-bar');
    tabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const panelId = btn.dataset.tab;
    const parentCard = btn.closest('.card');
    parentCard.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    parentCard.querySelector('#cv-tab-' + panelId)?.classList.add('active');
  });
});

export function flattenSkills(sk) {
  if (!sk) return [];
  if (typeof sk === 'string') return sk.split(',').map(x => x.trim()).filter(Boolean);
  if (Array.isArray(sk)) return sk.flatMap(flattenSkills);
  if (typeof sk === 'object') return Object.values(sk).flatMap(flattenSkills);
  return [String(sk)];
}

function renderCVPreview(data) {
  data.skills = flattenSkills(data.skills);

  // Styled CV preview matching original design
  const exp = (data.experience || []).map(e => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <strong style="font-size:13px;">${esc(e.role)}</strong>
        <span style="font-size:11px;color:#666;">${esc(e.period || '')}</span>
      </div>
      <div style="font-size:12px;color:#555;margin-bottom:6px;">${esc(e.company)}</div>
      <ul style="margin:0;padding-left:16px;">${(e.bullets||[]).map(b=>`<li style="font-size:12px;margin-bottom:3px;">${esc(b)}</li>`).join('')}</ul>
    </div>`).join('');

  document.getElementById('cv-styled-preview').innerHTML = `
    <div class="cv-preview-content" style="font-family:'Source Sans Pro',sans-serif;max-width:680px;">
      <div style="background:#f3f2ef;padding:18px 24px 14px;border-bottom:3px solid #175253;">
        <h1 style="font-size:22px;font-weight:700;color:#175253;margin:0 0 2px;">${esc(data.name || '')}</h1>
        <div style="font-size:13px;color:#555;">${esc(data.title || '')}</div>
        <div style="font-size:12px;color:#777;margin-top:4px;">${esc(data.contact || '')}</div>
      </div>
      <div style="padding:20px 24px;">
        ${data.summary ? `<div style="margin-bottom:18px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#175253;border-bottom:1.5px solid #175253;padding-bottom:3px;margin-bottom:8px;">Profile</div><p style="font-size:13px;line-height:1.6;color:#333;">${esc(data.summary)}</p></div>` : ''}
        ${exp ? `<div style="margin-bottom:18px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#175253;border-bottom:1.5px solid #175253;padding-bottom:3px;margin-bottom:10px;">Experience</div>${exp}</div>` : ''}
        ${data.skills?.length ? `<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#175253;border-bottom:1.5px solid #175253;padding-bottom:3px;margin-bottom:8px;">Skills</div><div style="font-size:12px;line-height:1.8;">${data.skills.map(esc).join(' · ')}</div></div>` : ''}
      </div>
    </div>`;

  // Copy sections
  const sections = { 'Profile Summary': data.summary, 'Skills': data.skills?.join(', ') };
  (data.experience || []).forEach(e => { sections[e.role + ' @ ' + e.company] = e.bullets?.join('\n'); });
  document.getElementById('cv-copy-sections').innerHTML = Object.entries(sections).filter(([,v])=>v).map(([k,v]) =>
    `<button class="copy-section-btn" data-content="${encodeURIComponent(v)}"><span>${esc(k)}</span><span>Copy</span></button>`
  ).join('');

  document.querySelectorAll('.copy-section-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = decodeURIComponent(btn.dataset.content);
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied'); btn.querySelector('span:last-child').textContent = '✓ Copied';
        setTimeout(() => { btn.classList.remove('copied'); btn.querySelector('span:last-child').textContent = 'Copy'; }, 1800);
      });
    });
  });
}

document.getElementById('cv-dl-btn').addEventListener('click', () => {
  if (!lastCVData) return;
  const printWin = window.open('', '_blank');
  printWin.document.write('<html><head><link rel="stylesheet" href="'+location.origin+'/fonts/print.css"><style>body{margin:0;padding:24px;font-family:"Source Sans Pro",sans-serif;}</style></head><body>');
  printWin.document.write(document.getElementById('cv-styled-preview').innerHTML);
  printWin.document.write('</body></html>');
  printWin.document.close();
  setTimeout(() => printWin.print(), 600);
});
