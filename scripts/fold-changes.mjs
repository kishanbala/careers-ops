#!/usr/bin/env node
// Folds per-PR fragments in changes/ into CHANGELOG.md ([Unreleased]) and docs/build-ledger.csv, then deletes them.
// Run by the Release agent (or before reading the cost ledger). Usage: node scripts/fold-changes.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function fold(root) {
  const dir = join(root, "changes");
  const files = readdirSync(dir).filter((f) => f !== "README.md").sort();
  const sections = {}; // "### Added" -> [bullets]
  const rows = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    if (f.endsWith(".csv")) rows.push(...text.split("\n").map((l) => l.trim()).filter(Boolean));
    else if (f.endsWith(".md")) {
      let h = "### Changed";
      for (const line of text.split("\n")) {
        if (line.startsWith("### ")) h = line.trim();
        else if (line.trim()) (sections[h] ||= []).push(line.replace(/\s+$/, ""));
      }
    }
  }
  const clPath = join(root, "CHANGELOG.md");
  const cl = readFileSync(clPath, "utf8").split("\n");
  const start = cl.indexOf("## [Unreleased]");
  if (start < 0) throw new Error("CHANGELOG.md has no '## [Unreleased]' heading");
  let end = cl.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = cl.length;
  for (const [h, bullets] of Object.entries(sections)) {
    const at = cl.findIndex((l, i) => i > start && i < end && l.trim() === h);
    if (at >= 0) {
      let i = at + 1;
      while (i < end && cl[i].trim() && !cl[i].startsWith("#")) i++;
      cl.splice(i, 0, ...bullets);
      end += bullets.length;
    } else {
      let i = end;
      while (i > start + 1 && !cl[i - 1].trim()) i--;
      cl.splice(i, 0, "", h, ...bullets);
      end += bullets.length + 2;
    }
  }
  writeFileSync(clPath, cl.join("\n"));
  if (rows.length) {
    const lp = join(root, "docs", "build-ledger.csv");
    const ledger = readFileSync(lp, "utf8").replace(/\n*$/, "\n");
    writeFileSync(lp, ledger + rows.join("\n") + "\n");
  }
  for (const f of files) rmSync(join(dir, f));
  return { files: files.length, rows: rows.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = fold(join(dirname(fileURLToPath(import.meta.url)), ".."));
  console.log(`folded ${r.files} fragment(s), ${r.rows} ledger row(s)`);
}
