// Phase 3B (#29): Interview tab. STAR starters and red-flag questions from the saved evaluation (fullData),
// plus the Story bank stories linked to this role. "Write this story" hands off to #/stories?role=&q= (spec §6).
import { h } from '../dom.js';
import { roleEval, starStarters, redFlags, linkedStories, storyParts, storyHref, str } from './model.js';
import { starterList, redFlagList } from './fit-tab.js';

export function renderInterviewTab(el, role, stories) {
  const data = roleEval(role);
  const stars = starStarters(data);
  const flags = redFlags(data);
  const mine = linkedStories(stories, role.id);

  const storyCard = h('section', { class: 'card role-card' },
    h('h2', { class: 'role-card-title' }, 'Stories to prepare'),
    stars.length
      ? starterList(role, stars)
      : h('p', { class: 'role-purpose' }, 'This evaluation has no story starters. Write a story for this role in the Story bank.'),
    stars.length ? null : h('a', { class: 'btn btn-outline role-qa-link', href: storyHref(role.id, '') }, 'Write a story'));

  const flagCard = flags.length ? h('section', { class: 'card role-card' },
    h('h2', { class: 'role-card-title' }, 'Questions to ask them'),
    redFlagList(flags)) : null;

  const linkedCard = h('section', { class: 'card role-card' },
    h('h2', { class: 'role-card-title' }, 'Your stories for this role'),
    mine.length
      ? h('ul', { class: 'role-stories' }, mine.map(s => h('li', { class: 'role-story' },
        h('details', null,
          h('summary', { class: 'role-story-q' }, str(s.question) || 'Story'),
          storyParts(s).map(p => h('div', { class: 'role-story-part' },
            h('p', { class: 'role-qa-tag' }, p.label),
            h('p', { class: 'role-text' }, p.text)))))))
      : h('p', { class: 'role-purpose' }, 'No stories are linked to this role yet. Use "Write this story" on a starter above.'));

  el.replaceChildren(...[storyCard, flagCard, linkedCard].filter(Boolean));
}
