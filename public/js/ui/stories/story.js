// Phase 3D Story bank: pure helpers (no DOM), unit-tested in tests/view-stories.test.js.
const text = v => (typeof v === 'string' ? v.trim() : '');

export const PART_LABELS = Object.freeze([
  ['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection'],
]);

export const storyTitle = s => text(s && s.question) || 'Story';

// Tags are model output: keep strings only, trimmed, unique, at most 8.
export function storyTags(s) {
  const raw = s && Array.isArray(s.tags) ? s.tags : [];
  return [...new Set(raw.map(text).filter(Boolean))].slice(0, 8);
}

// Parts to show in the story view, in reading order. Anything that is not a non-empty string is left out.
export function storyParts(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    full: text(o.fullStory),
    steps: PART_LABELS.map(([k, label]) => ({ key: k, label, text: text(o[k]) })).filter(p => p.text),
  };
}

// `#/stories?role=<id>&q=<text>` (3B -> 3D). Both optional; role stays a string until matched against real roles.
export function parseStoryQuery(hash) {
  const q = typeof hash === 'string' ? hash.split('?')[1] : '';
  const p = new URLSearchParams(q || '');
  return { role: (p.get('role') || '').trim(), q: (p.get('q') || '').trim().slice(0, 500) };
}

export const findRole = (pipeline, id) =>
  (Array.isArray(pipeline) ? pipeline : []).find(r => r && typeof r === 'object' && id !== '' && String(r.id) === String(id)) || null;

export const roleLabel = r => {
  if (!r) return '';
  const role = text(r.role), company = text(r.company);
  return [role, company].filter(Boolean).join(' at ');
};

// Roles a story is linked to that still exist (deleted or foreign ids are ignored).
export function linkedRoles(story, pipeline) {
  const ids = story && Array.isArray(story.roleIds) ? story.roleIds : [];
  return ids.map(id => findRole(pipeline, id)).filter(Boolean);
}

// What runTool('story') receives: the question, plus the context after a blank line (as v1 did).
export function buildContent(question, context) {
  const q = text(question), c = text(context);
  return c ? `${q}\n\nContext: ${c}` : q;
}
