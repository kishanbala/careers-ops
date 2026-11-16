// ===== LOCAL STORAGE =====
export const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

// ===== PIPELINE STATE =====
export let pipeline = LS.get('co_pipeline') || [];
export let stories = LS.get('co_stories') || [];
export let profile = LS.get('co_profile') || {};
// ES module bindings are read-only for importers; this is the only writer of `profile`.
export function setProfile(p) { profile = p; }
