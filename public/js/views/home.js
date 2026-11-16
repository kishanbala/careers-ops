// Phase 2 stub (3A replaces this file): first run, no profile yet (design §3).
import { renderStub } from '../shell.js';
import { href } from '../router.js';

export function mount(el) {
  renderStub(el, {
    title: 'Know which jobs are worth your time.',
    text: 'Add your CV once, paste a job, and Kairo tells you whether it is worth applying.',
    action: 'Start with your CV',
    href: href('profile'),
  });
  el.querySelector('.view-action')?.setAttribute('data-action', 'start-cv'); // spec §6 hook (shell.spec.js)
}
