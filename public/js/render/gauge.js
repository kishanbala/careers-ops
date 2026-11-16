// ===== GAUGE SVG =====
export function buildGauge(score, grade) {
  const norm = Math.max(0, Math.min(1, (score - 1) / 4));
  const angle = -180 + norm * 180;
  const r = 75;
  const cx = 90, cy = 90;
  const toRad = a => a * Math.PI / 180;

  function arcPoint(deg) {
    return [cx + r * Math.cos(toRad(deg)), cy + r * Math.sin(toRad(deg))];
  }

  const startX = cx - r, startY = cy;
  const endX = cx + r, endY = cy;

  // Filled arc
  const fillAngle = -180 + norm * 180;
  const [fillX, fillY] = arcPoint(fillAngle);

  let arcColour = 'var(--gauge-a)';
  if (score < 3) arcColour = 'var(--gauge-c)';
  else if (score < 4) arcColour = 'var(--gauge-b)';

  let gradeColour = '#166534', gradeBg = '#dcfce7';
  if (grade?.startsWith('B')) { gradeColour = '#92400e'; gradeBg = '#fef3c7'; }
  if (grade?.startsWith('C') || grade?.startsWith('D')) { gradeColour = '#991b1b'; gradeBg = '#fee2e2'; }

  // Needle
  const needleAngle = toRad(-180 + norm * 180);
  const nx = cx + r * 0.75 * Math.cos(needleAngle);
  const ny = cy + r * 0.75 * Math.sin(needleAngle);

  return `<svg class="gauge-svg" viewBox="0 0 180 100" xmlns="http://www.w3.org/2000/svg">
    <!-- track -->
    <path d="M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}" fill="none" stroke="${arcColour}22" stroke-width="10" stroke-linecap="round"/>
    <!-- filled arc -->
    <path d="M ${startX} ${cy} A ${r} ${r} 0 0 1 ${fillX} ${fillY}" fill="none" stroke="${arcColour}" stroke-width="10" stroke-linecap="round"/>
    <!-- needle -->
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${arcColour}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${arcColour}"/>
    <!-- score -->
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="auto" fill="#111827" font-family="Inter,sans-serif" font-size="22" font-weight="800">${score.toFixed(1)}</text>
    <!-- scale labels -->
    <text x="${startX}" y="${cy + 16}" text-anchor="middle" fill="#9ca3af" font-size="9" font-family="DM Mono,monospace">1</text>
    <text x="${endX}" y="${cy + 16}" text-anchor="middle" fill="#9ca3af" font-size="9" font-family="DM Mono,monospace">5</text>
  </svg>
  <div class="gauge-grade-pill" style="background:${gradeBg};color:${gradeColour}">${grade || '—'}</div>`;
}
