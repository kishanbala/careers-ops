// Escape model output before it goes into innerHTML
export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Only https: URLs become links; anything else renders no link
export function safeUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
}
