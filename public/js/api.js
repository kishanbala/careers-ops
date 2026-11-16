// ===== API CALL WITH RETRY =====
export async function callAPI(payload, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 429 || res.status === 529) {
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 1000));
          continue;
        }
        throw new Error('Rate limited — please try again in a moment.');
      }
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ===== runTool (Phase 3 spec §3): the one way new screens call the model =====
// callAPI above stays byte-identical for the legacy pages until Phase 4.
// runTool never throws. It sends no request for paused / empty / too long / missing-CV input,
// retries only where a retry cannot double-bill a finished answer (BUG-14), and turns
// {raw}, refusals and unusable replies into errors instead of blank results (BUG-01/02/05/06).
// isUsable lives in store.js (addRole/addStory need it; this keeps the import graph acyclic).
import { profile, isUsable } from './store.js';
import { isOn, PAUSED_BANNER } from './features.js';

export { isUsable };

export const TOOL_MODES = Object.freeze(['evaluate', 'pdf', 'story', 'research', 'negotiate', 'contacto']);
const NEEDS_CV = new Set(['evaluate', 'pdf', 'story', 'negotiate', 'contacto']);
const PROFILE_FIELDS = ['name', 'target', 'salary', 'location', 'story'];
export const MAX_INPUT_CHARS = 50000; // same cap as api/evaluate.js (413 above it)

const MESSAGES = Object.freeze({
  'paused': PAUSED_BANNER,
  'empty-input': 'Nothing to send yet. Add the text first.',
  'too-long': 'This text is too long (over 50,000 characters). Shorten it and try again.',
  'empty-profile': 'Add your CV in Profile first, so Kairo can compare it with the job.',
  'refused': 'The AI could not do this with the information given.',
  'unreadable': 'The AI sent an answer that could not be read. Nothing was saved. Try again.',
  'cut-off': 'The AI answer was cut off before it finished. Nothing was saved. Try again, or shorten the text.',
  'rate-limited': 'Too many requests right now. Wait a minute, then try again.',
  'server': 'The server could not finish this. Nothing was saved. Try again in a moment.',
  'network': 'Could not reach the server. Check your connection and try again.',
});
export const TOOL_ERROR_KINDS = Object.freeze(Object.keys(MESSAGES));

// One fixed, plain sentence per kind. Only `refused` shows the model's own message (render it with textContent).
export function toolMessage(result) {
  const kind = result && result.kind;
  if (kind === 'refused' && typeof result.message === 'string' && result.message.trim()) return result.message.trim();
  return MESSAGES[kind] || MESSAGES.server;
}

const fail = (kind, message) => ({ ok: false, kind, message: message || MESSAGES[kind] });

const realDelay = ms => new Promise(r => setTimeout(r, ms));
let delay = realDelay;
// Tests only: replace the wait between retries (call with no function to restore real timers).
export function _setRetryDelay(fn) { delay = typeof fn === 'function' ? fn : realDelay; }

const blank = v => typeof v !== 'string' || v.trim() === '';
const RATE_WAITS = [2000, 4000]; // 429/529: 3 attempts in total (XC-05)
const RETRY_ONCE = new Set([502, 503, 504]); // plus network errors; 500 and 4xx never retry (BUG-14)

function buildPayload(mode, content) {
  if (mode === 'research') return { mode, content };
  const p = profile && typeof profile === 'object' ? profile : {};
  const picked = {};
  for (const k of PROFILE_FIELDS) if (typeof p[k] === 'string') picked[k] = p[k];
  return { mode, content, cv: p.cv, profile: picked };
}

export async function runTool(mode, input, { flag } = {}) {
  try {
    // 1. paused (an unknown flag or mode counts as paused: nothing is sent; `scan` is never called in Phase 3)
    if (flag !== undefined) {
      let on = false;
      try { on = isOn(flag); } catch { on = false; }
      if (!on) return fail('paused');
    }
    if (!TOOL_MODES.includes(mode)) return fail('paused');
    // 2. input
    const content = input && typeof input.content === 'string' ? input.content : '';
    if (content.trim() === '') return fail('empty-input');
    if (content.length > MAX_INPUT_CHARS) return fail('too-long');
    // 3. CV (BUG-05)
    if (NEEDS_CV.has(mode)) {
      const cv = profile && profile.cv;
      if (blank(cv)) return fail('empty-profile');
      if (cv.length > MAX_INPUT_CHARS) return fail('too-long');
    }
    // 4. minimal payload (design §6)
    const body = JSON.stringify(buildPayload(mode, content));
    // 5. HTTP with retry rules
    let rateHits = 0;
    let retried = false;
    let res;
    for (;;) {
      try {
        res = await fetch('/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      } catch {
        if (!retried) { retried = true; await delay(1500); continue; }
        return fail('network');
      }
      if (res.status === 429 || res.status === 529) {
        if (rateHits < RATE_WAITS.length) { await delay(RATE_WAITS[rateHits++]); continue; }
        return fail('rate-limited');
      }
      if (RETRY_ONCE.has(res.status)) {
        if (!retried) { retried = true; await delay(1500); continue; }
        return fail('server');
      }
      break;
    }
    if (res.status === 413) return fail('too-long');
    if (!res.ok) return fail('server');
    // 6. reply
    let json;
    try { json = await res.json(); } catch { return fail('unreadable'); }
    const data = json && json.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('unreadable');
    if (data.raw !== undefined) return fail(json.truncated ? 'cut-off' : 'unreadable');
    if (data.error) return fail('refused', typeof data.message === 'string' ? data.message.trim() : '');
    if (!isUsable(mode, data)) return fail('unreadable');
    return { ok: true, data };
  } catch {
    return fail('server');
  }
}
