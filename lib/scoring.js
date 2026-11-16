// Deterministic scoring for the "evaluate" mode.
// Weights come from santifer/career-ops modes/ofertas.md (10 dimensions, sum = 1.0).
// LLMs are unreliable at weighted arithmetic, so the model scores each dimension and the server computes the total.

const WEIGHTS = {
  northStar: 0.25,
  cvMatch: 0.15,
  level: 0.15,
  comp: 0.1,
  growth: 0.1,
  remote: 0.05,
  companyReputation: 0.05,
  techStack: 0.05,
  speedToOffer: 0.05,
  cultureSignals: 0.05,
};

// The UI renders exactly these 6 keys (public/index.html buildDims); derived from the 10 above.
const LEGACY_DIMENSIONS = {
  roleImpact: "northStar",
  cvMatch: "cvMatch",
  compensation: "comp",
  growthPath: "growth",
  teamCulture: "cultureSignals",
  missionAlign: "companyReputation",
};

const DRAFT_ANSWERS_MIN_SCORE = 4.5;

function gradeFor(s) {
  if (s >= 4.5) return "A";
  if (s >= 4.0) return "A-";
  if (s >= 3.5) return "B+";
  if (s >= 3.0) return "B";
  if (s >= 2.5) return "C";
  return "D";
}

// Upstream ethics rule: below 3.0/5 is a weak match, advise skipping.
function recommendationFor(s) {
  if (s >= 4.5) return "Strongly Recommend";
  if (s >= 4.0) return "Recommend";
  if (s >= 3.0) return "Consider";
  return "Skip - weak match";
}

function validScoring(sc) {
  return (
    sc &&
    typeof sc === "object" &&
    Object.keys(WEIGHTS).every((k) => typeof sc[k] === "number" && Number.isFinite(sc[k]) && sc[k] >= 1 && sc[k] <= 5)
  );
}

// Returns a new object. If the model did not return a valid "scoring" block, data is returned untouched
// (the model's own legacy fields stay, so the UI keeps working).
function applyScoring(data) {
  if (!data || typeof data !== "object" || !validScoring(data.scoring)) return data;
  const sc = data.scoring;
  const total = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + sc[k] * w, 0);
  // +1e-9: floating point makes 3.65*10 = 36.4999..., which would round a true half down.
  const finalScore = Math.round((total + 1e-9) * 10) / 10;
  const dimensions = {};
  for (const [legacy, key] of Object.entries(LEGACY_DIMENSIONS)) dimensions[legacy] = sc[key];
  return {
    ...data,
    finalScore,
    grade: gradeFor(finalScore),
    recommendation: recommendationFor(finalScore),
    dimensions,
    // Section G is only for strong matches (upstream rule); don't ship drafts for weak fits.
    draftAnswers: finalScore >= DRAFT_ANSWERS_MIN_SCORE && Array.isArray(data.draftAnswers) ? data.draftAnswers : [],
    scoreSource: "server-weighted",
  };
}

module.exports = { WEIGHTS, LEGACY_DIMENSIONS, gradeFor, recommendationFor, applyScoring };
