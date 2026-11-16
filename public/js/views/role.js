// Phase 2 stub (3B replaces this file): the role workspace. One purpose line plus one action.
import { renderStub } from '../shell.js';
import { href } from '../router.js';
import { pipeline } from '../store.js';

export function mount(el, { params }) {
  const r = pipeline.find(x => x && String(x.id) === String(params.id));
  renderStub(el, r ? {
    title: `${r.role || 'Role'}${r.company ? ' at ' + r.company : ''}`,
    text: 'Role workspace: fit, tailored CV, research, outreach, interview and negotiation for this role, all pre-filled from its job description.',
    action: 'Back to pipeline',
    href: href('pipeline'),
    primary: false,
  } : {
    title: 'Role not found',
    text: 'This role is not in your pipeline on this browser.',
    action: 'Back to pipeline',
    href: href('pipeline'),
    primary: false,
  });
}
