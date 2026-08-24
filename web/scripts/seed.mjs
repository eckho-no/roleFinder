#!/usr/bin/env node
// Loads a seed fixture into D1 via `wrangler d1 execute`.
// Usage: node scripts/seed.mjs [--remote] [--file <path>] [--db <name>]
//   --file defaults to fixtures/seed.synthetic.json.
//   --db defaults to rolefinder-db. rolefinder-demo-db is the synthetic/demo
//   database (see wrangler.jsonc's DEMO_DB binding) — the real board only
//   ever goes into rolefinder-db, never the demo one.
//   The private converter (scripts/convert-private-tracker.mjs) points
//   --file at ../data/private/seed.local.json instead — never the synthetic one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const target = args.includes("--remote") ? "--remote" : "--local";
const fileFlagIndex = args.indexOf("--file");
const fixturePath =
  fileFlagIndex !== -1 && args[fileFlagIndex + 1]
    ? args[fileFlagIndex + 1]
    : new URL("../fixtures/seed.synthetic.json", import.meta.url).pathname;
const dbFlagIndex = args.indexOf("--db");
const dbName = dbFlagIndex !== -1 && args[dbFlagIndex + 1] ? args[dbFlagIndex + 1] : "rolefinder-db";

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

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
  console.log(`Seeding ${target.slice(2)} ${dbName} from ${fixturePath}...`);
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", dbName, target, "--file", sqlPath],
    { stdio: "inherit", cwd: new URL("..", import.meta.url) },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
