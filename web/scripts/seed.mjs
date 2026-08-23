#!/usr/bin/env node
// Loads fixtures/seed.synthetic.json into D1 via `wrangler d1 execute`.
// Usage: node scripts/seed.mjs [--remote]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const target = process.argv.includes("--remote") ? "--remote" : "--local";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/seed.synthetic.json", import.meta.url), "utf8"),
);

const jsonColumns = new Set([
  "titles",
  "locationRules",
  "positioning",
  "axes",
  "tierThresholds",
  "stats",
  "context",
  "proposedConfigDiff",
]);

function toSnakeCase(key) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function sqlValue(key, value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") return String(value);
  if (jsonColumns.has(key)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertStatements(table, rows) {
  return rows.map((row) => {
    const keys = Object.keys(row);
    const columns = keys.map(toSnakeCase).join(", ");
    const values = keys.map((key) => sqlValue(key, row[key])).join(", ");
    return `INSERT INTO ${table} (${columns}) VALUES (${values});`;
  });
}

// Insertion order matters — parents before children.
const tableOrder = [
  ["profile_config", fixture.profileConfig],
  ["runs", fixture.runs],
  ["queries", fixture.queries],
  ["companies", fixture.companies],
  ["listings", fixture.listings],
  ["scores", fixture.scores],
  ["sightings", fixture.sightings],
  ["notes", fixture.notes],
  ["duplicates", fixture.duplicates],
];

const sql = tableOrder
  .flatMap(([table, rows]) => insertStatements(table, rows ?? []))
  .join("\n");

const dir = mkdtempSync(join(tmpdir(), "rolefinder-seed-"));
const sqlPath = join(dir, "seed.sql");
writeFileSync(sqlPath, sql);

try {
  console.log(`Seeding ${target.slice(2)} D1 from fixtures/seed.synthetic.json...`);
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "rolefinder-db", target, "--file", sqlPath],
    { stdio: "inherit", cwd: new URL("..", import.meta.url) },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
