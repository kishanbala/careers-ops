// Home copy and static data (3A). Pure: no DOM, so tests/view-home.test.js can check it in Node.
// Wording follows docs/revamp/design-decisions.md §3 (hero, demo, checklist, privacy line). Plain text only.

export const HERO = Object.freeze({
  title: 'Know which jobs are worth your time.',
  text: 'Add your CV once, paste a job, and Kairo tells you whether it is worth applying.',
});

// Exact copy from design §3 (corrected privacy line).
export const PRIVACY_LINE = "Your CV and roles stay in this browser. When you run a tool, the text goes through our server to Anthropic's AI to produce the result. We don't store it.";

export const DEMO_STEPS = Object.freeze([
  { id: 'cv', title: 'Add your CV', text: 'Upload or paste it once. It stays in this browser.' },
  { id: 'job', title: 'Paste a job', text: 'Paste the job description. Kairo reads it against your CV and your goals.' },
  { id: 'verdict', title: 'Get a verdict', text: 'A score from 1 to 5 across 10 dimensions, and a clear call: apply, worth a look, or skip.' },
  { id: 'act', title: 'Act on it', text: 'Tailor your CV, research the company, write outreach, prepare the interview and the pay talk.' },
]);

export const CHECKLIST = Object.freeze([
  { id: 'cv', title: 'Add your CV', time: '2 min', route: 'profile', note: null },
  { id: 'goals', title: 'Say what you are after', time: '1 min', route: 'profile', note: 'optional' },
  { id: 'first', title: 'Evaluate your first job', time: 'under a minute', route: 'add', note: null },
]);

export const TOOLS = Object.freeze([
  { id: 'fit', title: 'Fit', text: 'Score, grade and all 10 dimensions, with the gaps spelled out.' },
  { id: 'cv', title: 'Tailored CV', text: 'Your CV rewritten for this role, ready to print or save as PDF.' },
  { id: 'research', title: 'Research', text: 'What to know about the company before you reply.' },
  { id: 'outreach', title: 'Outreach', text: 'A short note to the hiring manager or a recruiter.' },
  { id: 'interview', title: 'Interview', text: 'Story starters and the questions to ask, plus your saved stories.' },
  { id: 'negotiate', title: 'Negotiate', text: 'Scripts for the pay conversation.' },
]);

// Recommendation bands (Bala's decision on #27): apply >= 4.0, worth a look 3.0-3.9, skip < 3.0.
export const BANDS = Object.freeze([
  { id: 'apply', label: 'Apply', range: '4.0 and up', text: 'A strong match. Worth the time to apply.' },
  { id: 'look', label: 'Worth a look', range: '3.0 to 3.9', text: 'Some gaps. Read the Fit tab before you decide.' },
  { id: 'skip', label: 'Skip', range: 'Below 3.0', text: 'A weak match. Your time is better spent elsewhere.' },
]);

// Letter grades as lib/scoring.js gradeFor() assigns them. Medals: A gold, A- silver, B+ bronze (design §4).
export const GRADES = Object.freeze([
  { grade: 'A', range: '4.5 and up' },
  { grade: 'A-', range: '4.0 to 4.4' },
  { grade: 'B+', range: '3.5 to 3.9' },
  { grade: 'B', range: '3.0 to 3.4' },
  { grade: 'C', range: '2.5 to 2.9' },
  { grade: 'D', range: 'Below 2.5' },
]);
