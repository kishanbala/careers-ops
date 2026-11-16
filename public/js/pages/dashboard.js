import { pipeline, stories, LS } from '../store.js';
import { navigateTo } from '../router.js';
import { esc } from '../render/escape.js';
import { renderEvalBlocks } from '../render/eval-blocks.js';

export function savePipeline() { LS.set('co_pipeline', pipeline); renderDashboard(); }

export function updateBadges() {
  const count = pipeline.length;
  document.getElementById('sb-badge').textContent = count;
  document.getElementById('stat-total').textContent = count;
  const active = pipeline.filter(p => !['rejected','offer accepted'].includes((p.status||'').toLowerCase())).length;
  document.getElementById('stat-active').textContent = active;
  if (count > 0) {
    const avg = (pipeline.reduce((s, p) => s + (p.score || 0), 0) / count).toFixed(1);
    document.getElementById('stat-avg').textContent = avg;
    const top = pipeline.reduce((best, p) => (p.score || 0) > (best.score || 0) ? p : best, pipeline[0]);
    document.getElementById('stat-top').textContent = top?.grade || '—';
  } else {
    document.getElementById('stat-avg').textContent = '—';
    document.getElementById('stat-top').textContent = '—';
  }
  const sc = pipeline.length;
  const sb2 = document.getElementById('sb-stories-badge');
  if (sb2) sb2.textContent = stories.length;
}

// ===== DASHBOARD =====
const statusLabels = ['Researching','Saved','Applied','Interviewing','Offer Received','Rejected'];
const statusClassMap = {
  'researching':'status-researching','saved':'status-saved','applied':'status-applied',
  'interviewing':'status-interview','offer received':'status-offer','offer accepted':'status-offer',
  'rejected':'status-rejected'
};

function gradeClass(grade) {
  if (!grade) return 'grade-d';
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return 'grade-a';
  if (g.startsWith('B')) return 'grade-b';
  if (g.startsWith('C')) return 'grade-c';
  return 'grade-d';
}

export function renderDashboard() {
  updateBadges();
  const wrap = document.getElementById('pipeline-table-wrap');
  if (pipeline.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No applications yet</div><div class="empty-text">Evaluate an offer to get started</div><br><button class="btn btn-primary btn-sm" data-page="evaluate">Evaluate Offer</button></div>`;
    wrap.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigateTo(el.dataset.page)));
    return;
  }
  const rows = pipeline.map((p, i) => {
    const sc = p.status?.toLowerCase() || 'researching';
    const cls = statusClassMap[sc] || 'status-researching';
    const date = p.date ? new Date(p.date).toLocaleDateString('en-GB', {day:'numeric',month:'short'}) : '—';
    return `<tr data-idx="${i}">
      <td><div style="font-weight:600;font-size:13px;">${esc(p.role || '—')}</div><div style="font-size:12px;color:var(--text-secondary)">${esc(p.company || '')}</div></td>
      <td><span class="grade-badge ${gradeClass(p.grade)}" style="font-size:11px;width:28px;height:28px;">${esc(p.grade || '—')}</span></td>
      <td>${date}</td>
      <td><span class="score-num">${esc(p.score?.toFixed?.(1) || '—')}</span></td>
      <td><span class="match-pct" style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${p.match ? esc(p.match)+'%' : '—'}</span></td>
      <td>
        <select class="status-sel" data-idx="${i}" style="font-size:12px;border:1px solid var(--border);border-radius:6px;padding:3px 6px;background:var(--page-bg);">
          ${statusLabels.map(s => `<option ${s.toLowerCase() === sc ? 'selected' : ''}>${esc(s)}</option>`).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<div style="overflow-x:auto;"><table class="pipeline-table">
    <thead><tr><th>Role / Company</th><th>Grade</th><th>Date</th><th>Score</th><th>Match</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;

  wrap.querySelectorAll('tbody tr').forEach(row => {
    row.addEventListener('click', () => openPipelineModal(parseInt(row.dataset.idx)));
  });
  wrap.querySelectorAll('.status-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx);
      pipeline[idx].status = e.target.value.toLowerCase();
      savePipeline();
    });
  });
}

function openPipelineModal(idx) {
  const p = pipeline[idx];
  if (!p) return;
  document.getElementById('pipeline-modal-title').textContent = `${p.role || 'Role'} @ ${p.company || ''}`;
  const modal = document.getElementById('pipeline-modal');
  modal.classList.add('open');
  if (p.fullData) {
    document.getElementById('pipeline-modal-content').innerHTML = renderEvalBlocks(p.fullData);
  } else {
    document.getElementById('pipeline-modal-content').innerHTML = `<p style="color:var(--text-secondary);font-size:14px;">No detailed evaluation data saved for this entry.</p>`;
  }
}

document.getElementById('pipeline-modal-close').addEventListener('click', () => {
  document.getElementById('pipeline-modal').classList.remove('open');
});
document.getElementById('pipeline-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// Grade legend toggle
document.getElementById('grade-guide-btn').addEventListener('click', () => {
  const panel = document.getElementById('grade-legend-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});
