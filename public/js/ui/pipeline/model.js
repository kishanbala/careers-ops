// Phase 3C: pure helpers for the Pipeline screen (list filter, stage labels, date inputs, history rows).
import { band } from '../score.js';

export const STAGES = Object.freeze([
  { key: 'researching', label: 'Researching' },
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'interviewing', label: 'Interviewing' },
  { key: 'offer received', label: 'Offer received' },
  { key: 'rejected', label: 'Rejected' },
]);
const EXTRA = Object.freeze({ 'offer accepted': 'Offer accepted' }); // written by v1; shown, never offered as a new choice

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => (typeof v === 'string' ? v.trim() : '');

export const stageKey = status => text(status).toLowerCase();

export function stageLabel(status) {
  const k = stageKey(status);
  const hit = STAGES.find(s => s.key === k);
  if (hit) return hit.label;
  if (EXTRA[k]) return EXTRA[k];
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : 'Not set';
}

// Options for the stage select: the six stages, plus the role's current one if it is none of them.
export function stageOptions(current) {
  const k = stageKey(current);
  const opts = STAGES.map(s => ({ ...s }));
  if (k && !opts.some(o => o.key === k)) opts.push({ key: k, label: stageLabel(k) });
  return opts;
}

export const FILTERS = Object.freeze([{ key: 'all', label: 'All roles' }, { key: 'open', label: 'Open roles' }, ...STAGES]);

export function filterRoles(roles, filter = 'all') {
  const list = (Array.isArray(roles) ? roles : []).filter(isObj);
  if (filter === 'all') return list;
  if (filter === 'open') return list.filter(r => !['rejected', 'offer accepted'].includes(stageKey(r.status)));
  return list.filter(r => stageKey(r.status) === filter);
}

export function findRole(roles, id) {
  if (id === null || id === undefined) return null;
  return (Array.isArray(roles) ? roles : []).find(r => isObj(r) && String(r.id) === String(id)) || null;
}

// ISO -> value for <input type="datetime-local"> (local time, minutes). Empty string when there is no valid date.
export function toLocalInput(iso) {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// datetime-local value -> ISO string, or null for empty / invalid input.
export function fromLocalInput(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// The patch for updateRole: trimmed text (max 200) or null, ISO or null. Never a blank string.
export function nextActionPatch({ text: t, nextAt, interviewAt }) {
  const s = text(t).slice(0, 200);
  return { nextAction: s || null, nextActionAt: fromLocalInput(nextAt), interviewAt: fromLocalInput(interviewAt) };
}

export function historyRows(role) {
  const hist = isObj(role) && Array.isArray(role.stageHistory) ? role.stageHistory : [];
  return hist
    .filter(e => isObj(e) && text(e.status))
    .map(e => ({ label: stageLabel(e.status), at: typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) ? e.at : null }));
}

export const bandOf = role => band(isObj(role) ? role.score : undefined);

// One short line for list cards: the next action, else nothing (no invented text).
export function nextLine(role) {
  return isObj(role) ? text(role.nextAction) : '';
}
