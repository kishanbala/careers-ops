// Attribution footer (spec §11). Phase 3: Home only; Phase 4 mounts it on every screen.
// The attribution text is fixed (rule 6): never reword it.
import { h } from './dom.js';
import { safeUrl } from '../render/escape.js';

// Set to the Impressum page URL (https only) once Bala answers on #14. While null, no Impressum link is rendered.
export const IMPRESSUM_URL = null;

export const ATTRIBUTION = 'Evaluation method adapted from santifer/career-ops (MIT)';

export function siteFooter({ impressumUrl = IMPRESSUM_URL } = {}) {
  const imp = impressumUrl ? safeUrl(impressumUrl) : '';
  return h('footer', { class: 'k-site-footer', dataset: { role: 'site-footer' } },
    h('p', { class: 'k-site-footer-text' }, ATTRIBUTION),
    h('ul', { class: 'k-site-footer-links' },
      h('li', null, h('a', { href: '/privacy.html' }, 'Privacy')),
      imp ? h('li', null, h('a', { href: imp, rel: 'noopener noreferrer' }, 'Impressum')) : null));
}
