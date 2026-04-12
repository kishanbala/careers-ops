import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, content, cv, profile } = req.body;

  if (!content) {
    return res.status(400).json({ error: "No content provided" });
  }

  const systemPrompts = {
    evaluate: `You are Career-Ops, an expert AI career advisor. You evaluate job offers with a structured A-F scoring system.

Given a job description and a CV, produce a full evaluation with these 6 blocks:

1. ROLE SUMMARY — Title, company, location, archetype (LLMOps/Agentic/PM/SA/FDE/Transformation), key responsibilities
2. CV MATCH — Score 0-5, match percentage, strengths, gaps, how to frame gaps
3. LEVEL STRATEGY — Seniority assessment, growth path, title negotiation angle
4. COMP RESEARCH — Estimated base range, equity, market positioning
5. PERSONALIZATION HOOK — 2-3 specific angles to stand out in cover letter/interview
6. INTERVIEW PREP — 3 likely behavioral questions with STAR+Reflection story starters

Then produce a FINAL SCORE:
- Score each dimension 0-5: Role & Impact, CV Match, Compensation, Growth Path, Team & Culture, Mission Alignment
- Calculate weighted average
- Assign grade: A (4.5+), A- (4.0+), B+ (3.5+), B (3.0+), C (2.5+), D (below 2.5)
- Recommendation: Strongly Recommend (A), Recommend (B+), Neutral (B), Skip (C/D)

Format your response as JSON with this structure:
{
  "archetype": "string",
  "roleTitle": "string", 
  "company": "string",
  "finalScore": number,
  "grade": "string",
  "recommendation": "string",
  "matchPercent": number,
  "dimensions": {
    "roleImpact": number,
    "cvMatch": number,
    "compensation": number,
    "growthPath": number,
    "teamCulture": number,
    "missionAlign": number
  },
  "blocks": {
    "roleSummary": "string",
    "cvMatch": "string",
    "levelStrategy": "string",
    "compResearch": "string",
    "personalizationHook": "string",
    "interviewPrep": "string"
  },
  "starStories": [
    { "question": "string", "starter": "string" }
  ]
}`,

    pdf: `You are Career-Ops PDF generator. Given a CV in markdown and a job description, produce an ATS-optimized CV tailored to that specific role.

Inject relevant keywords from the JD naturally into the experience bullets. Reorder and reframe bullets to match what the JD prioritizes. Do not invent experience.

Return JSON:
{
  "name": "string",
  "title": "string",
  "contact": "string",
  "summary": "string (2-3 sentences, keyword-rich)",
  "experience": [
    {
      "company": "string",
      "role": "string",
      "period": "string",
      "bullets": ["string"]
    }
  ],
  "skills": ["string"],
  "keywords_injected": ["string (list of JD keywords you used)"]
}`,

    research: `You are Career-Ops deep researcher. Given a company name, produce a thorough intelligence report covering:
- Company overview (stage, funding, headcount, business model)
- Culture signals (work style, values, what employees say)
- Interview process (typical rounds, what they test for)
- Red flags (if any)
- Compensation benchmarks
- Why someone with an AI background would or wouldn't thrive there

Return JSON:
{
  "company": "string",
  "stage": "string",
  "funding": "string",
  "headcount": "string",
  "aiScore": "string",
  "overview": "string",
  "culture": "string",
  "interviewProcess": "string",
  "redFlags": "string",
  "compensation": "string",
  "verdict": "string"
}`,

    negotiate: `You are Career-Ops negotiation coach. Given the scenario details, produce a complete negotiation script with: opening, anchor, fallback, and close. Also provide email version.

Return JSON:
{
  "opening": "string",
  "anchor": "string", 
  "fallback": "string",
  "close": "string",
  "emailSubject": "string",
  "emailBody": "string",
  "tips": ["string"]
}`,

    story: `You are Career-Ops STAR+Reflection story generator. Given a behavioral interview question and some context about the person's background, generate a complete STAR+Reflection story.

Return JSON:
{
  "question": "string",
  "situation": "string",
  "task": "string", 
  "action": "string",
  "result": "string",
  "reflection": "string",
  "fullStory": "string (flowing narrative combining all parts)",
  "tags": ["string (Leadership/Technical/Influence/etc)"]
}`,

    scan: `You are Career-Ops portal scanner. Given a list of companies and job categories, simulate finding relevant open roles based on current AI/tech hiring trends.

Return JSON:
{
  "results": [
    {
      "company": "string",
      "role": "string",
      "url": "string",
      "portal": "string",
      "category": "string",
      "isNew": boolean
    }
  ],
  "summary": "string"
}`,

    contacto: `You are Career-Ops LinkedIn outreach specialist. Given a job description and the applicant's background, write a personalized LinkedIn connection message (under 300 characters) and a follow-up InMail.

Return JSON:
{
  "connectionNote": "string (under 300 chars)",
  "inMailSubject": "string",
  "inMailBody": "string",
  "tips": ["string"]
}`
  };

  const systemPrompt = systemPrompts[mode] || systemPrompts.evaluate;

  let userMessage = content;
  if (cv) userMessage += `\n\n---CV---\n${cv}`;
  if (profile) userMessage += `\n\n---PROFILE---\n${JSON.stringify(profile)}`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = message.content[0].text;

    // Strip markdown code fences if present
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ success: true, data: parsed, mode });
    } catch {
      // If not valid JSON, return raw text
      return res.status(200).json({ success: true, data: { raw: rawText }, mode });
    }
  } catch (error) {
    console.error("Anthropic API error:", error);
    return res.status(500).json({
      error: "API call failed",
      message: error.message,
    });
  }
}
