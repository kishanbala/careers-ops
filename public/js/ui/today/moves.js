// Phase 3C: timed moves for Today (pure, no DOM, no storage). Built only from fields the role really has:
// interviewAt, nextAction/nextActionAt, appliedAt, status and score. A null stays null, nothing is invented.
import { band } from '../score.js';

export const CLOSED = Object.freeze(['rejected', 'offer accepted']);
export const READY_STAGES = Object.freeze(['researching', 'saved']);
export const WAITING_DAYS = 7;
export const DAY_MS = 86_400_000;

export const GROUPS = Object.freeze([
  { key: 'overdue', title: 'Overdue' },
  { key: 'today', title: 'Today' },
  { key: 'upcoming', title: 'Coming up' },
  { key: 'waiting', title: 'Waiting for a reply' },
  { key: 'ready', title: 'Ready to apply' },
  { key: 'undated', title: 'Next steps without a date' },
]);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => (typeof v === 'string' ? v.trim() : '');

export const statusKey = r => text(r && r.status).toLowerCase();
export const isClosed = r => CLOSED.includes(statusKey(r));

// ISO string (or ms number) to ms; anything else, and unparsable dates, to null.
export function toMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

// Local midnight of the day containing ms.
export function dayStart(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// 'overdue' | 'today' | 'upcoming' for a moment, relative to now (local days).
export function bucketOf(at, now) {
  const start = dayStart(now);
  if (at < start) return 'overdue';
  const d = new Date(start);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return at < next ? 'today' : 'upcoming';
}

function mk(kind, r, extra) {
  return { kind, roleId: r.id, role: text(r.role) || 'Untitled role', company: text(r.company), ...extra };
}

// Returns { overdue, today, upcoming, waiting, ready, undated } (arrays of moves).
export function buildMoves(roles, now = Date.now()) {
  const out = { overdue: [], today: [], upcoming: [], waiting: [], ready: [], undated: [] };
  for (const r of Array.isArray(roles) ? roles : []) {
    if (!isObj(r) || isClosed(r)) continue;
    const interviewAt = toMs(r.interviewAt);
    const nextAt = toMs(r.nextActionAt);
    const nextText = text(r.nextAction);
    if (interviewAt !== null) out[bucketOf(interviewAt, now)].push(mk('interview', r, { text: 'Interview', at: interviewAt }));
    if (nextAt !== null) out[bucketOf(nextAt, now)].push(mk('next', r, { text: nextText || 'Next step', at: nextAt }));
    else if (nextText) out.undated.push(mk('undated', r, { text: nextText, at: null }));
    const appliedAt = toMs(r.appliedAt);
    if (statusKey(r) === 'applied' && appliedAt !== null && interviewAt === null) {
      const days = Math.floor((dayStart(now) - dayStart(appliedAt)) / DAY_MS);
      if (days >= WAITING_DAYS) out.waiting.push(mk('waiting', r, { text: `Applied ${days} days ago, no interview recorded`, at: appliedAt, days }));
    }
    if (band(r.score) === 'apply' && READY_STAGES.includes(statusKey(r))) out.ready.push(mk('ready', r, { text: 'Scores in the Apply band and is not applied yet', at: null, score: Number(r.score) }));
  }
  for (const k of ['overdue', 'today', 'upcoming']) out[k].sort((a, b) => a.at - b.at);
  out.waiting.sort((a, b) => a.at - b.at);
  out.ready.sort((a, b) => b.score - a.score);
  return out;
}

export const countMoves = moves => GROUPS.reduce((n, g) => n + moves[g.key].length, 0);

export function summary(roles) {
  const list = (Array.isArray(roles) ? roles : []).filter(isObj);
  return {
    total: list.length,
    open: list.filter(r => !isClosed(r)).length,
    apply: list.filter(r => !isClosed(r) && band(r.score) === 'apply').length,
    interviewing: list.filter(r => statusKey(r) === 'interviewing').length,
  };
}

const DATE_OPTS = { weekday: 'short', day: 'numeric', month: 'short' };
const TIME_OPTS = { hour: '2-digit', minute: '2-digit', hour12: false };
export const fmtDay = ms => new Date(ms).toLocaleDateString('en-GB', DATE_OPTS);
export const fmtTime = ms => new Date(ms).toLocaleTimeString('en-GB', TIME_OPTS);
export function fmtWhen(ms, now = Date.now()) {
  if (ms === null || ms === undefined) return '';
  const b = bucketOf(ms, now);
  const t = fmtTime(ms);
  return b === 'today' ? `Today, ${t}` : `${fmtDay(ms)}, ${t}`;
}
