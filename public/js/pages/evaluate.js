import { LS, pipeline } from '../store.js';
import { navigateTo } from '../router.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';
import { buildGauge } from '../render/gauge.js';
import { buildDims } from '../render/dims.js';
import { renderEvalBlocks } from '../render/eval-blocks.js';
import { savePipeline } from './dashboard.js';

let lastEvalResult = null;
let lastEvalJD = '';

// ===== EVALUATE OFFER =====
let evalMode = 'full';
let evalTimerInterval = null;

document.querySelectorAll('#eval-mode-chips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#eval-mode-chips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    evalMode = chip.dataset.mode;
    document.getElementById('eval-mode-desc').textContent = evalMode === 'full'
      ? 'Evaluate & Track: score the role and auto-add to your pipeline.'
      : 'Quick Evaluation: score without saving to pipeline.';
  });
});

document.getElementById('eval-run-btn').addEventListener('click', async () => {
  const jd = document.getElementById('eval-jd').value.trim();
  if (!jd) { showToast('Please paste a job description.'); return; }
  lastEvalJD = jd;

  document.getElementById('eval-input-state').style.display = 'none';
  document.getElementById('eval-loading-state').style.display = 'block';
  document.getElementById('eval-result-state').style.display = 'none';

  let secs = 0;
  evalTimerInterval = setInterval(() => {
    document.getElementById('eval-timer').textContent = ++secs + 's';
  }, 1000);

  try {
    const p = LS.get('co_profile') || {};
    const res = await callAPI({ mode: 'evaluate', content: jd, cv: p.cv, profile: p });
    clearInterval(evalTimerInterval);
    if (!res.success) throw new Error(res.error || 'Evaluation failed');
    lastEvalResult = res.data;
    renderEvalResult(res.data);
    if (evalMode === 'full') addToPipeline(res.data, jd);
  } catch (e) {
    clearInterval(evalTimerInterval);
    document.getElementById('eval-input-state').style.display = 'block';
    document.getElementById('eval-loading-state').style.display = 'none';
    showToast('Error: ' + e.message, 3500);
  }
});

function renderEvalResult(data) {
  document.getElementById('eval-loading-state').style.display = 'none';
  document.getElementById('eval-result-state').style.display = 'block';

  // Header
  const matchPct = data.matchPercent || 0;
  const recColour = data.finalScore >= 4 ? 'var(--strong)' : data.finalScore >= 3 ? 'var(--review)' : 'var(--weak)';
  document.getElementById('eval-result-header').innerHTML = `
    <div class="gauge-wrap" style="padding:0;">${buildGauge(data.finalScore || 0, data.grade)}</div>
    <div>
      <div class="eval-meta-title">${esc(data.roleTitle || 'Role')}</div>
      <div class="eval-meta-company">${esc(data.company || '')} · ${esc(data.jobLocation || '')}</div>
      <div class="eval-meta-row">
        <span class="eval-meta-chip" style="background:var(--surface);">📍 ${esc(data.jobLocation || '—')}</span>
        <span class="eval-meta-chip" style="background:var(--surface);">${esc(data.archetype || '—')}</span>
        <span class="eval-meta-chip" style="color:${recColour};background:${recColour}18;">${esc(data.recommendation || '—')}</span>
        <span class="eval-meta-chip" style="background:var(--surface);font-family:var(--font-mono);">Match: ${esc(matchPct)}%</span>
      </div>
    </div>`;

  // Gauge already in header — hide separate wrap
  document.getElementById('eval-gauge-wrap').style.display = 'none';

  // Dimensions
  if (data.dimensions) {
    document.getElementById('eval-dims-wrap').innerHTML = buildDims(data.dimensions);
  }

  // Blocks
  document.getElementById('eval-blocks-wrap').innerHTML = renderEvalBlocks(data);

  // Show/hide add button
  const addBtn = document.getElementById('eval-add-btn');
  addBtn.style.display = evalMode === 'quick' ? 'inline-flex' : 'none';
}

document.getElementById('eval-add-btn').addEventListener('click', () => {
  if (lastEvalResult) { addToPipeline(lastEvalResult, lastEvalJD); showToast('Added to pipeline ✓'); }
});
document.getElementById('eval-new-btn').addEventListener('click', () => {
  document.getElementById('eval-input-state').style.display = 'block';
  document.getElementById('eval-result-state').style.display = 'none';
  document.getElementById('eval-jd').value = '';
});

export function addToPipeline(data, jd) {
  const entry = {
    id: Date.now(),
    role: data.roleTitle || 'Unknown Role',
    company: data.company || 'Unknown Company',
    score: data.finalScore,
    grade: data.grade,
    match: data.matchPercent,
    archetype: data.archetype,
    location: data.jobLocation,
    status: 'researching',
    date: new Date().toISOString(),
    fullData: data,
    jd: jd.substring(0, 500)
  };
  pipeline.unshift(entry);
  savePipeline();
}

// ===== EVAL HEADER — also wire up CV + Stories nav buttons =====
document.getElementById('eval-go-cv-btn').addEventListener('click', () => {
  const jd = document.getElementById('eval-jd').value.trim();
  if (jd) document.getElementById('cv-jd').value = jd;
  navigateTo('cv');
});
document.getElementById('eval-go-stories-btn').addEventListener('click', () => navigateTo('stories'));
