// ===== TOAST =====
// #toast is a polite live region (role=status, in index.html before any message is set), so screen readers announce it
// (WCAG 4.1.3). The text is cleared after the toast hides, and set one tick after the clear, so a repeated message
// ("Copied" twice) is announced again.
let hideTimer = null;
export function showToast(msg, duration = 2200) {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(hideTimer);
  t.textContent = '';
  setTimeout(() => { t.textContent = msg; }, 30);
  t.classList.add('show');
  hideTimer = setTimeout(() => { t.classList.remove('show'); t.textContent = ''; }, duration);
}
