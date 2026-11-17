// Phase 3D: Story bank (#/stories). STORY-01 generate (flag stories.generate, on), STORY-03 list + view, STORY-04 delete.
// `#/stories?role=<id>&q=<text>` (from the role workspace) pre-fills the question and links the new story to that role.
// Generate goes through runTool('story') and addStory only: a {raw}, refused or empty reply is an error, never a blank card.
import { h } from '../ui/dom.js';
import { runTool } from '../api.js';
import { stories, pipeline, addStory, removeStory, onChange } from '../store.js';
import { href } from '../router.js';
import { openModal } from '../ui/modal.js';
import { showRunning, showToolError } from '../ui/tool-state.js';
import { pauseControl, pausedBanner } from '../ui/paused.js';
import { showToast } from '../render/toast.js';
import { storyTitle, storyTags, storyParts, parseStoryQuery, findRole, roleLabel, linkedRoles, buildContent } from '../ui/stories/story.js';

let uid = 0;
const text = v => (typeof v === 'string' ? v.trim() : '');

// The modal is a <dialog> in <body>, outside #view-stories, so the view's scoped CSS cannot reach it. Its content is styled
// with CSSOM style properties (h() applies them with setProperty, which strict style CSP allows). Tokens only.
const ST = {
  tags: { display: 'flex', 'flex-wrap': 'wrap', gap: '6px', margin: '0 0 12px', padding: '0', 'list-style': 'none' },
  tag: { padding: '2px 10px', 'border-radius': 'var(--radius-pill)', background: 'var(--chip-bg)', color: 'var(--chip-text)', 'font-size': '12px' },
  para: { margin: '0 0 12px', 'font-size': '14px', color: 'var(--apply-text)' },
  full: { margin: '0 0 16px', 'font-style': 'italic', 'line-height': '1.5', 'overflow-wrap': 'anywhere' },
  step: { margin: '0 0 12px' },
  label: { margin: '0 0 2px', 'font-size': '12px', 'font-weight': '600', 'letter-spacing': '0.05em', 'text-transform': 'uppercase', color: 'var(--muted)' },
  text: { margin: '0', 'font-size': '15px', 'line-height': '1.5', 'overflow-wrap': 'anywhere', 'white-space': 'pre-wrap' },
  btn: { 'min-height': 'var(--tap-min)', 'margin-top': '8px' },
  confirm: { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', gap: '8px 12px', 'margin-top': '8px' },
  confirmText: { margin: '0', flex: '1 1 100%', 'font-size': '14px', 'font-weight': '600' },
};

function storyBody(s, onDelete) {
  const parts = storyParts(s);
  const roles = linkedRoles(s, pipeline);
  const tags = storyTags(s);
  const confirm = h('div', { class: 'st-confirm', style: ST.confirm });
  const delBtn = h('button', { type: 'button', class: 'btn btn-outline st-delete', style: ST.btn, dataset: { action: 'delete-story' }, onClick: () => {
    delBtn.hidden = true;
    confirm.replaceChildren(
      h('p', { class: 'st-confirm-text', role: 'alert', style: ST.confirmText }, 'Delete this story? This cannot be undone.'),
      h('button', { type: 'button', class: 'btn btn-primary', style: { 'min-height': 'var(--tap-min)' }, dataset: { action: 'confirm-delete' }, onClick: onDelete }, 'Delete story'),
      h('button', { type: 'button', class: 'btn btn-outline', style: { 'min-height': 'var(--tap-min)' }, onClick: () => { confirm.replaceChildren(); delBtn.hidden = false; delBtn.focus(); } }, 'Keep it'));
    const first = confirm.querySelector('button');
    if (first) first.focus();
  } }, 'Delete story');
  return h('div', { class: 'st-body' },
    tags.length ? h('ul', { class: 'st-tags', 'aria-label': 'Tags', style: ST.tags }, tags.map(t => h('li', { class: 'st-tag', style: ST.tag }, t))) : null,
    roles.length ? h('p', { class: 'st-for', style: ST.para }, 'For: ', roles.map((r, i) => [i ? ', ' : '', h('a', { href: href('role', { id: r.id }), style: { color: 'inherit' } }, roleLabel(r))])) : null,
    parts.full ? h('p', { class: 'st-full', style: ST.full }, parts.full) : null,
    parts.steps.map(p => h('section', { class: 'st-step', style: ST.step }, h('h3', { class: 'st-step-label', style: ST.label }, p.label), h('p', { class: 'st-step-text', style: ST.text }, p.text))),
    !parts.full && !parts.steps.length ? h('p', { class: 'st-step-text', style: ST.text }, 'This story has no text.') : null,
    delBtn, confirm);
}

export function mount(el) {
  const n = ++uid;
  const q = parseStoryQuery(typeof location !== 'undefined' ? location.hash : '');
  let link = findRole(pipeline, q.role); // only a role that exists is linked
  let alive = true;
  let busy = false;

  const qId = `st-q-${n}`;
  const cId = `st-c-${n}`;
  const qEl = h('textarea', { class: 'form-textarea st-q', id: qId, rows: 3, name: 'question' });
  qEl.value = q.q;
  const cEl = h('textarea', { class: 'form-textarea st-c', id: cId, rows: 3, name: 'context' });
  const linkNote = h('p', { class: 'st-link-note', role: 'status' });
  const showLink = () => { linkNote.textContent = link ? `This story will be linked to ${roleLabel(link)}.` : ''; linkNote.hidden = !link; };
  showLink();
  const status = h('div', { class: 'st-status', 'aria-live': 'polite' });
  const genBtn = h('button', { type: 'button', class: 'btn btn-primary st-generate', dataset: { action: 'generate-story' } }, 'Generate STAR+R story');

  const headingId = `st-h-${n}`;
  const listHead = h('h2', { class: 'card-title st-list-title', id: headingId, tabindex: '-1' });
  const listBox = h('div', { class: 'st-list-box' });

  function openStory(s) {
    let close = null;
    const body = storyBody(s, () => {
      let ok = false;
      try { ok = removeStory(s.id); } catch { ok = false; }
      if (close) close();
      if (ok) showToast('Story deleted');
      else if (alive) status.replaceChildren(h('div', { class: 'k-tool-error', role: 'alert' }, h('p', { class: 'k-tool-error-text' }, 'This story could not be deleted. Nothing was changed.')));
      if (alive) listHead.focus();
    });
    close = openModal({ title: storyTitle(s), body, actions: [{ label: 'Close', primary: true }] });
  }

  function renderList() {
    if (!alive) return;
    const list = Array.isArray(stories) ? stories.filter(s => s && typeof s === 'object') : [];
    listHead.textContent = list.length ? `Your stories (${list.length})` : 'Your stories';
    if (!list.length) {
      listBox.replaceChildren(h('div', { class: 'st-empty' },
        h('p', { class: 'st-empty-title' }, 'No stories yet'),
        h('p', { class: 'st-hint' }, 'A story bank is a handful of true examples you can adapt to any interview question. Write the first one from a question above.'),
        h('button', { type: 'button', class: 'btn btn-outline', dataset: { action: 'focus-question' }, onClick: () => qEl.focus() }, 'Write your first story')));
      return;
    }
    listBox.replaceChildren(h('ul', { class: 'st-list' }, list.map(s => {
      const tags = storyTags(s).slice(0, 4);
      const roles = linkedRoles(s, pipeline);
      return h('li', { class: 'st-item' },
        h('button', { type: 'button', class: 'st-card', 'aria-haspopup': 'dialog', dataset: { storyId: s.id }, onClick: () => openStory(s) },
          h('span', { class: 'st-card-q' }, storyTitle(s)),
          roles.length ? h('span', { class: 'st-card-for' }, 'For: ', roles.map(roleLabel).join(', ')) : null,
          tags.length ? h('span', { class: 'st-card-tags' }, tags.map(t => h('span', { class: 'st-tag' }, t))) : null));
    })));
  }
  renderList();
  const offs = [onChange('co_stories', renderList), onChange('co_pipeline', renderList)];

  async function generate() {
    if (busy) return;
    const question = text(qEl.value);
    if (!question) { showToolError(status, { ok: false, kind: 'empty-input' }); qEl.focus(); return; }
    busy = true; genBtn.disabled = true;
    const stop = showRunning(status, 'Writing your story…');
    const r = await runTool('story', { content: buildContent(question, cEl.value) }, { flag: 'stories.generate' });
    stop();
    if (!r.ok) {
      busy = false; genBtn.disabled = false;
      if (alive && el.isConnected) showToolError(status, r, { retry: generate });
      return;
    }
    // A finished call still saves, even if the person has left this screen.
    let saved = null;
    try { saved = addStory(r.data, { roleId: link ? link.id : undefined }); } catch { saved = null; }
    busy = false; genBtn.disabled = false;
    if (!alive || !el.isConnected) return;
    if (!saved) {
      status.replaceChildren(h('div', { class: 'k-tool-error', role: 'alert' }, h('p', { class: 'k-tool-error-text' }, 'Browser storage is full, so this story was not saved. Export a backup from Home and free some space, then try again.')));
      return;
    }
    qEl.value = ''; cEl.value = '';
    link = null; showLink();
    status.replaceChildren(h('p', { class: 'st-saved', role: 'status' }, 'Story saved. ',
      h('button', { type: 'button', class: 'st-linkbtn', dataset: { action: 'read-new' }, onClick: () => openStory(saved) }, 'Read it')));
  }
  genBtn.addEventListener('click', generate);

  const genBox = h('div', { class: 'st-gen' },
    h('div', { class: 'st-field' }, h('label', { class: 'form-label', for: qId }, 'Interview question'), qEl,
      h('p', { class: 'st-hint' }, 'For example: "Tell me about a time you disagreed with a stakeholder."')),
    h('div', { class: 'st-field' }, h('label', { class: 'form-label', for: cId }, 'Context (optional)'), cEl,
      h('p', { class: 'st-hint' }, 'A project or period from your CV you want the story built on. Kairo uses only your CV and what you write here.')),
    linkNote,
    h('div', { class: 'st-actions' }, genBtn),
    status);
  pauseControl(genBox, 'stories.generate'); // no-op while the flag is on; flipping it off pauses this form

  el.replaceChildren(
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Story bank'),
      h('p', { class: 'page-subtitle' }, 'STAR+R stories (situation, task, action, result, reflection) you can reuse in interviews. They stay in this browser.')),
    h('div', { class: 'st-cols' },
      h('section', { class: 'card st-card-box', 'aria-label': 'Write a story' },
        h('h2', { class: 'card-title' }, 'Write a story'),
        genBox, pausedBanner('stories.generate')),
      h('section', { class: 'card st-card-box', 'aria-labelledby': headingId }, listHead, listBox)));

  return function unmount() {
    alive = false;
    for (const off of offs) { try { off(); } catch { /* gone */ } }
  };
}
