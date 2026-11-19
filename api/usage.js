const { getUsageSummary } = require("../lib/usage-log.js");

// Admin-only usage/cost dashboard data for public/admin/usage.html.
// Gated by a single shared secret (ADMIN_DASHBOARD_KEY) — a lock, not a login system. That's
// deliberate: this is a single-operator project, not a multi-user access-control surface.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.kairoapp.eu");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const adminKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!adminKey) return res.status(500).json({ error: "ADMIN_DASHBOARD_KEY not configured" });

  const provided = (req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || req.query?.key;
  if (provided !== adminKey) return res.status(401).json({ error: "Unauthorized" });

  try {
    const summary = await getUsageSummary(Number(req.query?.days) || 14);
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ error: "Failed to load usage data", message: error.message });
  }
};
