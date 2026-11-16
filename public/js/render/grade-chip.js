// Medal grade chips (design-decisions §4): A gold, A- silver, B+ bronze, everything else plain steel.
import { esc } from './escape.js';

export function gradeTier(grade) {
  switch (String(grade == null ? '' : grade).trim().toUpperCase()) {
    case 'A': return 'gold';
    case 'A-': return 'silver';
    case 'B+': return 'bronze';
    default: return 'steel';
  }
}

export function gradeChip(grade, { size = 'md' } = {}) {
  const g = String(grade == null ? '' : grade).trim();
  return `<span class="grade-chip grade-chip--${gradeTier(g)} grade-chip--${esc(size)}" aria-label="Grade ${esc(g)}">${esc(g)}</span>`;
}
