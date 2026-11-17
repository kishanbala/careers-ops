// Phase 3B (#29): pure helpers for the role workspace (#/role/:id/:tab). No DOM, no storage, no network:
// they turn a stored role and model replies into plain lists of text, so the views can render them with h().
// Every value that came from the model is returned as a string (or dropped), never as markup.
import { safeUrl } from '../../render/escape.js';

export const TABS = Object.freeze([
  Object.freeze({ id: 'fit', label: 'Fit' }),
  Object.freeze({ id: 'cv', label: 'Tailored CV' }),
  Object.freeze({ id: 'research', label: 'Research' }),
  Object.freeze({ id: 'outreach', label: 'Outreach' }),
  Object.freeze({ id: 'interview', label: 'Interview' }),
  Object.freeze({ id: 'negotiate', label: 'Negotiate' }),
]);

// Evaluation blocks A-F (prompts/evaluate.md). G (draft answers) is a list and rendered separately.
export const BLOCKS = Object.freeze([
  ['A', 'roleSummary', 'Role summary'],
  ['B', 'cvMatch', 'CV match'],
  ['C', 'levelStrategy', 'Level strategy'],
  ['D', 'compResearch', 'Pay'],
  ['E', 'personalizationHook', 'Why you'],
  ['F', 'interviewPrep', 'Interview plan'],
].map(b => Object.freeze(b)));

// The five scenarios of the v1 Negotiation page (NEG-01...05), same wording, so the prompt sees the same text.
export const SCENARIOS = Object.freeze([
  'Counter initial offer',
  'Leverage competing offer',
  'Geographic discount pushback',
  'Equity vs cash tradeoff',
  'Role leveling pushback',
]);

// LinkedIn connection note limits (OUT-02 / BUG-13): 200 characters without Premium, 300 with it.
export const NOTE_FREE = 200;
export const NOTE_MAX = 300;

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const str = v => (typeof v === 'string' ? v.trim() : (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''));
const arr = v => (Array.isArray(v) ? v : []);

export function findRole(list, id) {
  return arr(list).find(r => isObj(r) && String(r.id) === String(id)) || null;
}

// The saved evaluation of a role (v1 and v2 both keep it in fullData). Missing or foreign shapes give {}.
export function roleEval(role) {
  return isObj(role) && isObj(role.fullData) ? role.fullData : {};
}

export function hasFullEval(role) {
  const d = roleEval(role);
  return isObj(d.scoring) || isObj(d.blocks) || arr(d.starStories).length > 0;
}

export function roleHeading(role) {
  const r = isObj(role) ? role : {};
  const d = roleEval(r);
  return {
    title: str(r.role) || str(d.roleTitle) || 'Role',
    company: str(r.company) || str(d.company),
    location: str(r.location) || str(d.jobLocation),
    grade: str(r.grade) || str(d.grade),
    score: typeof r.score === 'number' ? r.score : d.finalScore,
  };
}

export function evalBlocks(data) {
  const b = isObj(data) && isObj(data.blocks) ? data.blocks : {};
  return BLOCKS.filter(([, k]) => str(b[k])).map(([letter, key, title]) => ({ letter, key, title, text: str(b[key]) }));
}

export function starStarters(data) {
  return arr(isObj(data) ? data.starStories : null)
    .filter(s => isObj(s) && str(s.question))
    .map(s => ({ question: str(s.question), starter: str(s.starter), reflection: str(s.reflection) }));
}

export function redFlags(data) {
  return arr(isObj(data) ? data.redFlagQuestions : null)
    .filter(q => isObj(q) && str(q.question))
    .map(q => ({ question: str(q.question), answer: str(q.answer) }));
}

export function keywords(data) {
  return [...new Set(arr(isObj(data) ? data.keywords : null).map(str).filter(Boolean))];
}

export function draftAnswers(data) {
  return arr(isObj(data) ? data.draftAnswers : null)
    .filter(a => isObj(a) && str(a.question) && str(a.answer))
    .map(a => ({ question: str(a.question), answer: str(a.answer) }));
}

// Stories linked to this role (schema v2 roleIds[]); ids compare as strings like the store does.
export function linkedStories(stories, roleId) {
  return arr(stories).filter(s => isObj(s) && arr(s.roleIds).some(x => String(x) === String(roleId)));
}

export const STORY_PARTS = Object.freeze([
  ['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result'], ['reflection', 'Reflection'],
]);

export function storyParts(story) {
  const s = isObj(story) ? story : {};
  const parts = STORY_PARTS.filter(([k]) => str(s[k])).map(([k, label]) => ({ key: k, label, text: str(s[k]) }));
  if (!parts.length && str(s.fullStory)) parts.push({ key: 'fullStory', label: 'Story', text: str(s.fullStory) });
  return parts;
}

// Hash hand-off to the Story bank (spec §6): #/stories?role=<id>&q=<question>. The router ignores the query.
export function storyHref(roleId, question) {
  const q = new URLSearchParams();
  if (roleId != null && String(roleId) !== '') q.set('role', String(roleId));
  if (str(question)) q.set('q', str(question));
  const s = q.toString().replace(/\+/g, '%20');
  return s ? `#/stories?${s}` : '#/stories';
}

// Connection-note counter (OUT-02, BUG-13): counts characters as the user sees them (code points).
export function noteCount(text) {
  const count = [...String(text == null ? '' : text)].length;
  const fit = count <= NOTE_FREE ? 'free' : count <= NOTE_MAX ? 'premium' : 'over';
  const message = {
    free: `Fits the ${NOTE_FREE}-character limit for free LinkedIn accounts.`,
    premium: `Over ${NOTE_FREE} characters: only fits with LinkedIn Premium (${NOTE_MAX}). Shorten it for a free account.`,
    over: `Over ${NOTE_MAX} characters: LinkedIn will not accept it. Shorten it before sending.`,
  }[fit];
  return { count, fit, message, label: `${count} / ${fit === 'free' ? NOTE_FREE : NOTE_MAX}` };
}

// ----- tool inputs (same text shapes the v1 pages sent, so the prompts see what they were tested with) -----
export function researchContent(company) {
  const c = str(company);
  return c ? `Research: ${c}` : '';
}

export function outreachContent(jd, target) {
  const j = str(jd);
  if (!j) return '';
  const t = str(target);
  return t ? `${j}\n\nReaching out to: ${t}` : j;
}

export function negotiateContent(f) {
  const v = isObj(f) ? f : {};
  return [
    `Scenario: ${str(v.scenario) || SCENARIOS[0]}`,
    `Their offer: ${str(v.offer)}`,
    `Target: ${str(v.target)}`,
    `Competing offer: ${str(v.competing)}`,
    `Context: ${str(v.context)}`,
  ].join('\n');
}

// Pre-fill for the Negotiate form: the role's own facts and the profile's salary target, nothing invented.
export function negotiateDefaults(role, profile) {
  const h = roleHeading(role);
  const p = isObj(profile) ? profile : {};
  const where = [h.company, h.location].filter(Boolean).join(', ');
  return {
    scenario: SCENARIOS[0],
    offer: '',
    target: str(p.salary),
    competing: '',
    context: `Role: ${h.title}${where ? ` at ${where}` : ''}.`,
  };
}

// ----- research brief -----
export const RESEARCH_FACTS = Object.freeze([['stage', 'Stage'], ['funding', 'Funding'], ['headcount', 'Headcount']]);
export const RESEARCH_BLOCKS = Object.freeze([
  ['overview', 'Overview'], ['culture', 'Culture'], ['techStack', 'Tech stack'],
  ['interviewProcess', 'Interview process'], ['compensation', 'Pay'], ['redFlags', 'Red flags'],
]);

export function researchView(data) {
  const d = isObj(data) ? data : {};
  return {
    company: str(d.company),
    aiScore: str(d.aiScore),
    facts: RESEARCH_FACTS.filter(([k]) => str(d[k])).map(([key, label]) => ({ key, label, text: str(d[key]) })),
    blocks: RESEARCH_BLOCKS.filter(([k]) => str(d[k])).map(([key, label]) => ({ key, label, text: str(d[key]) })),
    verdict: str(d.verdict),
  };
}

// ----- negotiation script -----
export const NEG_SECTIONS = Object.freeze([
  ['opening', 'Opening'], ['anchor', 'Anchor'], ['fallback', 'Fallback'], ['close', 'Close'], ['crossBorderNotes', 'Cross-border notes'],
]);

export function negotiateView(data) {
  const d = isObj(data) ? data : {};
  return {
    sections: NEG_SECTIONS.filter(([k]) => str(d[k])).map(([key, label]) => ({ key, label, text: str(d[key]) })),
    emailSubject: str(d.emailSubject),
    emailBody: str(d.emailBody),
    tips: arr(d.tips).map(str).filter(Boolean),
  };
}

// ----- outreach -----
export function outreachView(data) {
  const d = isObj(data) ? data : {};
  return {
    note: str(d.connectionNote),
    subject: str(d.inMailSubject),
    body: str(d.inMailBody),
    tips: arr(d.tips).map(str).filter(Boolean),
  };
}

// ----- tailored CV (CV-01/03/04/07). Contact, education and languages appear only when the model returned them. -----
export function cvContact(data) {
  const d = isObj(data) ? data : {};
  const out = [];
  if (str(d.email)) out.push({ key: 'email', text: str(d.email) });
  if (str(d.phone)) out.push({ key: 'phone', text: str(d.phone) });
  if (str(d.location)) out.push({ key: 'location', text: str(d.location) });
  if (str(d.linkedin)) {
    const url = safeUrl(str(d.linkedin)); // https only; anything else stays plain text
    out.push(url ? { key: 'linkedin', text: str(d.linkedin), href: url } : { key: 'linkedin', text: str(d.linkedin) });
  }
  if (str(d.nationality)) out.push({ key: 'nationality', text: str(d.nationality) });
  if (!out.length && str(d.contact)) out.push({ key: 'contact', text: str(d.contact) }); // older single-line shape
  return out;
}

export function cvExperience(data) {
  return arr(isObj(data) ? data.experience : null)
    .filter(e => isObj(e) && (str(e.role) || str(e.company)))
    .map(e => ({
      role: str(e.role),
      company: str(e.company),
      period: str(e.period),
      location: str(e.location),
      bullets: arr(e.bullets).map(str).filter(Boolean),
    }));
}

export function cvEducation(data) {
  return arr(isObj(data) ? data.education : null)
    .map(e => (typeof e === 'string' ? { degree: str(e), institution: '', period: '', location: '' } : e))
    .filter(e => isObj(e) && (str(e.degree) || str(e.institution)))
    .map(e => ({ degree: str(e.degree), institution: str(e.institution), period: str(e.period), location: str(e.location) }));
}

export function cvLanguages(data) {
  return arr(isObj(data) ? data.languages : null).map(l => {
    if (typeof l === 'string') return str(l);
    if (!isObj(l)) return '';
    const name = str(l.lang) || str(l.language) || str(l.name);
    const level = str(l.level);
    return name && level ? `${name} (${level})` : name;
  }).filter(Boolean);
}

// flattenSkills is the protected fix in render/skills.js; the caller passes it in so this file stays pure.
export function cvSkills(data, flattenSkills) {
  const d = isObj(data) ? data : {};
  const list = typeof flattenSkills === 'function' ? flattenSkills(d.skills) : [];
  return [...new Set(list.map(str).filter(Boolean))];
}

// Copy sections (CV-04): label + plain text, in reading order.
export function cvCopySections(data, flattenSkills) {
  const d = isObj(data) ? data : {};
  const out = [];
  if (str(d.summary)) out.push({ label: 'Profile summary', text: str(d.summary) });
  for (const e of cvExperience(d)) {
    if (!e.bullets.length) continue;
    out.push({ label: [e.role, e.company].filter(Boolean).join(' at '), text: e.bullets.join('\n') });
  }
  const skills = cvSkills(d, flattenSkills);
  if (skills.length) out.push({ label: 'Skills', text: skills.join(', ') });
  const edu = cvEducation(d);
  if (edu.length) out.push({ label: 'Education', text: edu.map(e => [e.degree, e.institution, e.period].filter(Boolean).join(', ')).join('\n') });
  const langs = cvLanguages(d);
  if (langs.length) out.push({ label: 'Languages', text: langs.join(', ') });
  return out;
}
