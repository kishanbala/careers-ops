// ===== DIMENSION BARS =====
export function buildDims(dims) {
  const labels = {
    roleImpact: 'Role Impact', cvMatch: 'CV Match', compensation: 'Compensation',
    growthPath: 'Growth Path', teamCulture: 'Team & Culture', missionAlign: 'Mission Align'
  };
  const items = Object.entries(dims).map(([k, v]) => {
    const pct = ((v - 1) / 4 * 100).toFixed(0);
    const cls = v >= 4 ? 'strong' : v >= 3 ? 'review' : 'weak';
    return `<div class="dim-row">
      <span class="dim-label">${labels[k] || k}</span>
      <div class="dim-bar-wrap"><div class="dim-bar ${cls}" style="width:${pct}%"></div></div>
      <span class="dim-score">${v.toFixed(1)}</span>
    </div>`;
  }).join('');
  return `<div class="dim-list">${items}</div>
  <div class="dim-legend">
    <div class="dim-legend-item"><div class="dim-legend-dot" style="background:var(--strong)"></div>≥4.0 Strong</div>
    <div class="dim-legend-item"><div class="dim-legend-dot" style="background:var(--review)"></div>3.0–3.9 Review</div>
    <div class="dim-legend-item"><div class="dim-legend-dot" style="background:var(--weak)"></div>&lt;3.0 Weak</div>
  </div>`;
}
