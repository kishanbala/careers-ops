const Anthropic = require("@anthropic-ai/sdk");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { mode, content, cv, profile } = req.body;
  if (!content) return res.status(400).json({ error: "No content provided" });

  const systemPrompts = {
    evaluate: `You are Career-Ops. Evaluate this job offer against the CV.

CRITICAL RULES:
1. COMPENSATION: Extract the job location (city + country) from the JD itself. Use THAT location for salary benchmarks, never the candidate location. Switzerland = CHF (Senior DA: CHF 95k-130k). Germany = EUR (Senior DA: EUR 65k-85k). Netherlands = EUR (Senior DA: EUR 55k-80k). UK = GBP. Always state the job city, country and currency. Note if significantly above/below market.
2. SCORING: Score each dimension 1-5. Grade: A (4.5+), A- (4.0+), B+ (3.5+), B (3.0+), C (2.5+), D (below 2.5).
3. CV MATCH: Be specific — name actual skills from the JD and map them to actual experience from the CV.
4. PERSONALIZATION: Give 2-3 specific hooks based on actual CV achievements vs actual JD requirements.

Return ONLY valid JSON, no markdown fences:
{"archetype":"string","roleTitle":"string","company":"string","jobLocation":"city, country","finalScore":4.2,"grade":"A-","recommendation":"Strongly Recommend","matchPercent":85,"dimensions":{"roleImpact":4.5,"cvMatch":4.2,"compensation":4.0,"growthPath":4.3,"teamCulture":4.1,"missionAlign":4.5},"blocks":{"roleSummary":"string","cvMatch":"string","levelStrategy":"string","compResearch":"string","personalizationHook":"string","interviewPrep":"string"},"starStories":[{"question":"string","starter":"string"},{"question":"string","starter":"string"},{"question":"string","starter":"string"}]}`,

    pdf: `You are Career-Ops CV tailor. Given a CV and job description, rewrite the CV tailored to the JD. Inject relevant keywords naturally. Reframe bullets to match JD priorities. Do not invent experience. Lead with impact metrics.

CRITICAL RULES:
1. NEVER remove, merge, or combine any jobs or roles from the original CV — include every single position as a separate entry.
2. ALWAYS preserve nationality/citizenship (e.g. EU National) in the nationality field.
3. Keep all original contact details intact.
4. If the CV has 5 roles, the output must have exactly 5 experience entries. Count them before returning.

Return ONLY valid JSON, no markdown fences:
{"name":"string","title":"string","email":"string","phone":"string","location":"string","nationality":"string (e.g. EU National)","linkedin":"string","summary":"string","experience":[{"company":"string","role":"string","period":"string","location":"string","bullets":["string"]}],"skills":{"proficient":["string"],"intermediate":["string"]},"languages":[{"lang":"string","level":"string"}],"education":[{"institution":"string","degree":"string","period":"string","location":"string"}],"interests":["string"],"keywords_injected":["string"]}` ,

    research: `You are Career-Ops researcher. Return ONLY valid JSON: {"company":"string","stage":"string","funding":"string","headcount":"string","aiScore":"A","overview":"string","culture":"string","interviewProcess":"string","redFlags":"string","compensation":"string","verdict":"string"}`,

    negotiate: `You are Career-Ops negotiation coach. Return ONLY valid JSON: {"opening":"string","anchor":"string","fallback":"string","close":"string","emailSubject":"string","emailBody":"string","tips":["string"]}`,

    story: `You are Career-Ops STAR story generator. Return ONLY valid JSON: {"question":"string","situation":"string","task":"string","action":"string","result":"string","reflection":"string","fullStory":"string","tags":["string"]}`,

    scan: `You are Career-Ops scanner. Suggest 6 realistic data analyst / BI job openings in Germany and Europe. Return ONLY valid JSON: {"results":[{"company":"string","role":"string","url":"string","portal":"string","category":"string","isNew":true}],"summary":"string"}`,

    contacto: `You are Career-Ops outreach specialist. Return ONLY valid JSON: {"connectionNote":"string under 300 chars","inMailSubject":"string","inMailBody":"string","tips":["string"]}`
  };

  const systemPrompt = systemPrompts[mode] || systemPrompts.evaluate;
  let userMessage = content;
  if (cv) userMessage += `\n\nCANDIDATE CV:\n${cv}`;
  if (profile && profile.name) userMessage += `\n\nCANDIDATE CONTEXT:\nName: ${profile.name}\nTarget Role: ${profile.target || ""}\nTarget Salary: ${profile.salary || ""}\nLocation: ${profile.location || ""}\nCareer Story: ${profile.story || ""}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = message.content[0].text;
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return res.status(200).json({ success: true, data: parsed, mode });
    } catch {
      return res.status(200).json({ success: true, data: { raw: rawText }, mode });
    }
  } catch (error) {
    return res.status(500).json({ error: "API call failed", message: error.message });
  }
};