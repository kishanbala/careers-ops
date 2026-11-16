import { LS, stories } from '../store.js';
import { callAPI } from '../api.js';
import { esc } from '../render/escape.js';
import { showToast } from '../render/toast.js';
import { updateBadges } from './dashboard.js';

export function saveStories() { LS.set('co_stories', stories); renderStories(); updateBadges(); }

// ===== INTERVIEW STORIES =====
document.getElementById('story-gen-btn').addEventListener('click', async () => {
  const q = document.getElementById('story-q').value.trim();
  const ctx = document.getElementById('story-ctx').value.trim();
  if (!q) { showToast('Enter a behavioural question.'); return; }
  const btn = document.getElementById('story-gen-btn');
  btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Generating…';
  const p = LS.get('co_profile') || {};
  try {
    const content = q + (ctx ? '\n\nContext: ' + ctx : '');
    const res = await callAPI({ mode: 'story', content, cv: p.cv, profile: p });
    btn.disabled = false; btn.textContent = 'Generate STAR+R Story';
    if (res.success && res.data) {
      stories.unshift({ id: Date.now(), ...res.data });
      saveStories();
      document.getElementById('story-q').value = '';
      document.getElementById('story-ctx').value = '';
    }
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Generate STAR+R Story';
    showToast('Story generation failed: ' + e.message, 3000);
  }
});

export function renderStories() {
  const empty = document.getElementById('stories-empty');
  const list = document.getElementById('stories-list');
  updateBadges();
  if (stories.length === 0) { empty.style.display = 'block'; list.innerHTML = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = stories.map((s, i) =>
    `<div class="story-card" data-idx="${i}">
      <div class="story-q">${esc(s.question || 'Story')}</div>
      <div class="story-tags">${(s.tags||[]).map(t=>`<span class="story-tag">${esc(t)}</span>`).join('')}</div>
    </div>`
  ).join('');
  list.querySelectorAll('.story-card').forEach(card => {
    card.addEventListener('click', () => openStoryModal(parseInt(card.dataset.idx)));
  });
}

function openStoryModal(idx) {
  const s = stories[idx];
  document.getElementById('story-modal-title').textContent = s.question || 'Story';
  document.getElementById('story-modal-content').innerHTML = `
    ${s.fullStory ? `<div class="eval-block-body" style="margin-bottom:16px;font-style:italic;">${esc(s.fullStory)}</div>` : ''}
    ${s.situation ? `<div class="eval-block"><div class="eval-block-title">Situation</div><div class="eval-block-body">${esc(s.situation)}</div></div>` : ''}
    ${s.task ? `<div class="eval-block"><div class="eval-block-title">Task</div><div class="eval-block-body">${esc(s.task)}</div></div>` : ''}
    ${s.action ? `<div class="eval-block"><div class="eval-block-title">Action</div><div class="eval-block-body">${esc(s.action)}</div></div>` : ''}
    ${s.result ? `<div class="eval-block"><div class="eval-block-title">Result</div><div class="eval-block-body">${esc(s.result)}</div></div>` : ''}
    ${s.reflection ? `<div class="eval-block"><div class="eval-block-title">Reflection</div><div class="eval-block-body">${esc(s.reflection)}</div></div>` : ''}
    <button class="btn btn-outline btn-sm" style="margin-top:8px;" data-delete-story="${idx}">Delete Story</button>`;
  document.getElementById('story-modal-content').querySelector('[data-delete-story]').addEventListener('click', () => deleteStory(idx));
  document.getElementById('story-modal').classList.add('open');
}
function deleteStory(idx) {
  stories.splice(idx, 1); saveStories();
  document.getElementById('story-modal').classList.remove('open');
  showToast('Story deleted');
}
document.getElementById('story-modal-close').addEventListener('click', () => document.getElementById('story-modal').classList.remove('open'));
document.getElementById('story-modal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });
