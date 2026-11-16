// Phase 2 stub (3C replaces this file). With roles it delegates to the legacy dashboard until Phase 3.
import { renderStub, showLegacy } from '../shell.js';
import { href } from '../router.js';

export function mount(el, { state }) {
  if (state === 'today') return showLegacy('dashboard');
  renderStub(el, {
    title: 'Today',
    text: 'Evaluate your first job: paste a job description and get a verdict in under a minute.',
    action: 'Evaluate your first job',
    href: href('add'),
  });
}
