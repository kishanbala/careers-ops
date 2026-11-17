// Phase 3B (#29): one wiring for every model-backed action in the role workspace.
// - runTool() is the only path to the model (spec §3); it never throws and sends nothing for paused/empty/no-CV input.
// - The button is disabled while a call runs (no double billing) and the seconds count up (EVAL-03).
// - Results live in memory for this tab only (never in localStorage), keyed by role + tool, so switching
//   tabs and coming back shows the last answer, and a call that finishes after the user left still lands.
// - DOM writes are guarded by isConnected (spec §3: no AbortController).
import { runTool } from '../../api.js';
import { showRunning, showToolError } from '../tool-state.js';

const results = new Map(); // key -> Result ({ok:true,data} | {ok:false,kind,message})
const pending = new Map(); // key -> Promise<Result>
const drafts = new Map(); // key -> { field: value } typed by the user (memory only)

export const toolKey = (roleId, tool) => `${String(roleId)}:${tool}`;

export function draft(key, defaults) {
  if (!drafts.has(key)) drafts.set(key, { ...defaults });
  return drafts.get(key);
}

// Drop the typed drafts of one role (after its saved JD changes, so the tools pre-fill the new JD).
export function forgetDrafts(roleId) {
  const prefix = `${String(roleId)}:`;
  for (const k of [...drafts.keys()]) if (k.startsWith(prefix)) drafts.delete(k);
}

// Tests only: forget everything kept in memory.
export function _resetToolMemory() { results.clear(); pending.clear(); drafts.clear(); }

// wireTool: button click -> runTool(mode, buildInput()) -> render(data) into resultEl, or the error.
// Returns { run } so a caller can trigger it (e.g. "Try again").
export function wireTool({ key, mode, button, statusEl, resultEl, buildInput, render, runningLabel }) {
  const idleLabel = button.textContent;

  function show(res) {
    if (!resultEl.isConnected) return;
    if (res.ok) {
      resultEl.replaceChildren();
      render(resultEl, res.data);
    } else {
      showToolError(resultEl, res, { retry: run });
    }
  }

  function busy(on) {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
    button.textContent = on ? 'Working…' : idleLabel;
  }

  function follow(promise) {
    busy(true);
    resultEl.replaceChildren();
    const stop = showRunning(statusEl, runningLabel);
    promise.then(res => {
      stop();
      if (!button.isConnected) return;
      busy(false);
      show(res);
    });
  }

  async function run() {
    if (pending.has(key)) return;
    const promise = runTool(mode, buildInput()).then(res => {
      pending.delete(key);
      results.set(key, res);
      return res;
    });
    pending.set(key, promise);
    follow(promise);
  }

  button.addEventListener('click', run);
  if (pending.has(key)) follow(pending.get(key));
  else if (results.has(key)) show(results.get(key));
  return { run };
}
