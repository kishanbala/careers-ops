// Phase 3B (#29): the role workspace, #/role/:id/:tab (design §1, spec §6).
// Tabs: Fit · Tailored CV · Research · Outreach · Interview · Negotiate. Every tool is pre-filled from the
// role's JD and the profile; the JD is never asked for twice. Model output is rendered as text only (ui/dom.js h()).
import { h } from '../ui/dom.js';
import { href } from '../router.js';
import { pipeline, stories, profile, onChange, updateRole } from '../store.js';
import { showToast } from '../render/toast.js';
import { TABS, findRole } from '../ui/role/model.js';
import { roleHeader, fullJdBox, roleTabs } from '../ui/role/header.js';
import { forgetDrafts } from '../ui/role/tool.js';
import { renderFitTab } from '../ui/role/fit-tab.js';
import { renderCvTab } from '../ui/role/cv-tab.js';
import { renderResearchTab, renderOutreachTab, renderNegotiateTab } from '../ui/role/tools-tabs.js';
import { renderInterviewTab } from '../ui/role/interview-tab.js';

let lastRoleId = null; // keeps keyboard focus on the tab bar when moving between tabs of the same role

function notFound(el) {
  el.replaceChildren(h('div', { class: 'role-view role-missing' },
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Role not found'),
      h('p', { class: 'page-subtitle view-purpose' }, 'This role is not in your pipeline on this browser.')),
    h('a', { class: 'btn btn-outline role-btn view-action', href: href('pipeline') }, 'Back to pipeline')));
}

function saveFullJd(id, text) {
  const jd = typeof text === 'string' ? text.trim() : '';
  if (!jd) return 'Paste the job description first.';
  forgetDrafts(id); // before the write: updateRole notifies listeners synchronously and the view redraws from the drafts
  try {
    if (!updateRole(id, { jd, jdComplete: true })) return 'This role is no longer in your pipeline.';
  } catch {
    return 'Not enough browser storage to save this. Free some space (Profile shows usage) and try again.';
  }
  showToast('Full job description saved');
  return '';
}

function renderTab(panel, tab, role) {
  switch (tab) {
    case 'cv': return renderCvTab(panel, role);
    case 'research': return renderResearchTab(panel, role);
    case 'outreach': return renderOutreachTab(panel, role);
    case 'interview': return renderInterviewTab(panel, role, stories);
    case 'negotiate': return renderNegotiateTab(panel, role, profile);
    default: return renderFitTab(panel, role);
  }
}

export function mount(el, { params = {} } = {}) {
  const id = params.id;
  const tab = TABS.some(t => t.id === params.tab) ? params.tab : 'fit';
  const sameRole = lastRoleId !== null && String(lastRoleId) === String(id);
  lastRoleId = id;

  function draw() {
    const role = findRole(pipeline, id);
    if (!role) { notFound(el); return; }
    const panel = h('div', { class: 'role-panel', id: `role-panel-${tab}`, dataset: { tab } });
    el.replaceChildren(h('div', { class: 'role-view', dataset: { roleId: String(role.id) } },
      h('a', { class: 'role-back', href: href('pipeline', { id: role.id }) }, h('span', { 'aria-hidden': 'true' }, '← '), 'Pipeline'),
      roleHeader(role),
      role.jdComplete === false ? fullJdBox(text => saveFullJd(role.id, text)) : null,
      roleTabs(role.id, tab),
      panel));
    renderTab(panel, tab, role);
  }

  draw();
  if (sameRole) el.querySelector('.role-tab[aria-current="page"]')?.focus({ preventScroll: true });

  const offs = [
    onChange('co_pipeline', draw),
    onChange('co_stories', () => { if (tab === 'interview') draw(); }),
  ];
  return () => offs.forEach(off => off());
}
