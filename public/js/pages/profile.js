import { LS, setProfile } from '../store.js';
import { showToast } from '../render/toast.js';

// ===== PROFILE =====
export function loadProfile() {
  const p = LS.get('co_profile') || {};
  if (p.name) document.getElementById('p-name').value = p.name;
  if (p.title) document.getElementById('p-title').value = p.title;
  if (p.location) document.getElementById('p-location').value = p.location;
  if (p.target) document.getElementById('p-target').value = p.target;
  if (p.salary) document.getElementById('p-salary').value = p.salary;
  if (p.minscore) document.getElementById('p-minscore').value = p.minscore;
  if (p.story) document.getElementById('p-story').value = p.story;
  if (p.cv) { document.getElementById('p-cv').value = p.cv; document.getElementById('cv-upload-zone').classList.add('has-cv'); document.getElementById('cv-upload-prompt').innerHTML = `<div style="font-size:28px;margin-bottom:8px;">✅</div><div style="font-size:13px;font-weight:600;color:var(--strong);">CV loaded</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Click to replace</div>`; }
}

document.getElementById('save-profile-btn').addEventListener('click', () => {
  const p = {
    name: document.getElementById('p-name').value,
    title: document.getElementById('p-title').value,
    location: document.getElementById('p-location').value,
    target: document.getElementById('p-target').value,
    salary: document.getElementById('p-salary').value,
    minscore: document.getElementById('p-minscore').value,
    story: document.getElementById('p-story').value,
    cv: document.getElementById('p-cv').value,
  };
  LS.set('co_profile', p);
  setProfile(p);
  const msg = document.getElementById('profile-save-msg');
  msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 2000);
  showToast('Profile saved ✓');
});
