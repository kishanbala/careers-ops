// Protected fix (build-plan §0, tests/protected-fixes.test.js): skills arrive as a string, a list of strings
// or objects (e.g. {proficient, intermediate}). Moved here unchanged from the retired pages/cv.js (Phase 4A).
// Pure: no DOM, so Node tests import it directly. Import it; never copy it.
export function flattenSkills(sk) {
  if (!sk) return [];
  if (typeof sk === 'string') return sk.split(',').map(x => x.trim()).filter(Boolean);
  if (Array.isArray(sk)) return sk.flatMap(flattenSkills);
  if (typeof sk === 'object') return Object.values(sk).flatMap(flattenSkills);
  return [String(sk)];
}
