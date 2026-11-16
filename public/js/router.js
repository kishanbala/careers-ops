// ===== NAVIGATION =====
export function navigateTo(pageId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item, .mobile-tab').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId)?.classList.add('active');
  document.querySelectorAll('[data-page="' + pageId + '"]').forEach(n => n.classList.add('active'));
  window.scrollTo(0, 0);
}

document.querySelectorAll('[data-page]').forEach(el => {
  el.addEventListener('click', () => navigateTo(el.dataset.page));
});
