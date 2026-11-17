// Backup helpers for Home (export and restore). Pure parts only; the view does the DOM, download and modal.
// The round trip goes through store.exportAll / importAll(dryRun), which validate the file.

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024; // a backup is a few hundred KB at most; refuse anything silly

const pad = n => String(n).padStart(2, '0');

export function backupFilename(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `kairo-backup-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}.json`;
}

// -> { ok: true, obj } | { ok: false, error }. Never throws.
export function parseBackupText(text, size = typeof text === 'string' ? text.length : 0) {
  if (size > MAX_BACKUP_BYTES) return { ok: false, error: 'That file is too large to be a Kairo backup.' };
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, error: 'That file is empty.' };
  try { return { ok: true, obj: JSON.parse(text) }; } catch { return { ok: false, error: 'That file is not valid JSON, so it is not a Kairo backup.' }; }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// counts = { profile: 0|1, roles, stories } as returned by importAll.
export function describeCounts(counts) {
  const c = counts || {};
  return [
    c.profile ? 'your profile' : 'no profile',
    plural(Number(c.roles) || 0, 'role', 'roles'),
    plural(Number(c.stories) || 0, 'story', 'stories'),
  ].join(', ');
}
