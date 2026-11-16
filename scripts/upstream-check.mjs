#!/usr/bin/env node
// Compares upstream career-ops (modes/ prompts + release version) against .upstream-sync.json.
// Usage: node scripts/upstream-check.mjs [--accept]   (--accept records current upstream as the new baseline)
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MAP = JSON.parse(readFileSync(new URL("../prompts/modes.json", import.meta.url), "utf8")); // local mode -> upstream files

const REPO = process.env.UPSTREAM_REPO || "santifer/career-ops";
const FILE = new URL("../.upstream-sync.json", import.meta.url);
const H = { "User-Agent": "upstream-check", ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) };
const get = async (u, raw) => {
  const r = await fetch(u, { headers: H });
  if (!r.ok) throw new Error(`${u} -> ${r.status}`);
  return raw ? r.text() : r.json();
};

const [manifest, modes] = await Promise.all([
  get(`https://raw.githubusercontent.com/${REPO}/main/.release-please-manifest.json`).catch(() => ({})),
  get(`https://api.github.com/repos/${REPO}/contents/modes`),
]);
const now = { repo: REPO, version: manifest["."] ?? null, modes: Object.fromEntries(modes.filter((f) => f.type === "file").map((f) => [f.name, f.sha])) };

if (process.argv.includes("--accept") || !existsSync(FILE)) {
  writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
  console.log(`Baseline recorded: upstream ${now.version}, ${Object.keys(now.modes).length} mode files.`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(FILE, "utf8"));
const added = Object.keys(now.modes).filter((k) => !(k in base.modes));
const removed = Object.keys(base.modes).filter((k) => !(k in now.modes));
const changed = Object.keys(now.modes).filter((k) => k in base.modes && base.modes[k] !== now.modes[k]);
if (!added.length && !removed.length && !changed.length && base.version === now.version) {
  console.log(`In sync with upstream ${now.version}.`);
  process.exit(0);
}
// Which local prompts derive from the upstream files that changed/appeared.
const touched = new Set([...changed, ...added]);
const review = Object.entries(MAP).filter(([m, c]) => !m.startsWith("_") && c.upstream.some((f) => touched.has(f))).map(([m, c]) => `\`prompts/${c.parts[c.parts.length - 1]}.md\` (mode ${m})`);
const link = (k) => `[${k}](https://github.com/${REPO}/blob/main/modes/${k})`;
const out = [
  `Upstream \`${REPO}\`: **${base.version} → ${now.version}**`,
  changed.length && `**Changed prompts:** ${changed.map(link).join(", ")}`,
  added.length && `**New prompts:** ${added.map(link).join(", ")}`,
  removed.length && `**Removed:** ${removed.join(", ")}`,
  review.length && `**Local prompts to review:** ${review.join(", ")}`,
  `Changelog: https://github.com/${REPO}/blob/main/CHANGELOG.md`,
  `After porting what you want into \`prompts/*.md\` (then \`npm run build:prompts\`), run \`npm run upstream:accept\`.`,
].filter(Boolean).join("\n\n");
console.log(out);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, "drift=true\n", { flag: "a" });
writeFileSync("upstream-report.md", out + "\n");
