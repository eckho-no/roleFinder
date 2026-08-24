#!/usr/bin/env node
// One-off converter: the real markdown tracker → data/private/seed.local.json.
// Usage: node scripts/convert-private-tracker.mjs <path-to-tracker.md>
//
// Mechanically parses the three scored tables (Act/Consider/Skip — they're
// well-formed markdown tables with a fixed column shape: Company | Role |
// Link | Scores | Total | Domain). Everything else in the real tracker
// (closed/pending, logged-not-scored, "also surfaced" prose lists) isn't
// structured enough to parse reliably and isn't attempted here — per
// PLAN_2.0.md's own framing, this is a one-off LLM-assisted conversion, not
// a permanent mechanical parser. Extend the `extras` array below by hand
// (or have an LLM do it from the same source file) for those sections
// before running a real seed.
//
// Never prints real values to stdout beyond row counts — the whole point of
// this script is that the real data only ever touches disk, gitignored.
import { readFileSync } from "node:fs";
import { writePrivateSeed } from "./write-private-seed.mjs";

const trackerPath = process.argv[2];
if (!trackerPath) {
  console.error("Usage: node scripts/convert-private-tracker.mjs <path-to-tracker.md>");
  process.exit(1);
}

const markdown = readFileSync(trackerPath, "utf8");

// Matches a markdown table row like:
// | **Company** | Role | [indeed](url) | 4·4·4·5·5·2 | **24** | No |
// The first cell is sometimes "**Company** (a parenthetical aside)" — [^|]*
// after the closing ** absorbs that instead of requiring the pipe right away.
const ROW_RE =
  /^\|\s*\*\*(.+?)\*\*[^|]*\|\s*(.+?)\s*\|\s*(?:\[.*?\]\((.+?)\)|\*no link.*?\*)\s*\|\s*([\d·]+)\s*\|\s*\*\*(\d+)\*\*\s*\|\s*(.+?)\s*\|\s*$/;

function parseTierTable(section, tier) {
  const rows = [];
  for (const line of section.split("\n")) {
    const match = ROW_RE.exec(line.trim());
    if (!match) continue;
    const [, company, role, link, scoreString, total] = match;
    const axisScores = scoreString.split("·").map(Number);
    rows.push({ company, role, link: link ?? null, axisScores, total: Number(total), tier });
  }
  return rows;
}

function extractSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) return "";
  const rest = markdown.slice(start + heading.length);
  const nextHeading = rest.search(/\n###? /);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

const actRows = parseTierTable(extractSection(markdown, "### Act ("), "act");
const considerRows = parseTierTable(extractSection(markdown, "### Consider ("), "consider");
const skipRows = parseTierTable(extractSection(markdown, "### Skip ("), "skip");

const allRows = [...actRows, ...considerRows, ...skipRows];

// Extend by hand for closed/logged-only/prose entries the regex above can't
// reach — same shape, tier/total/axisScores left null since they were never
// scored. See the module comment.
const extras = [];

const axisIds = ["role_shape", "variety_autonomy", "stack_fit", "location", "flexibility", "money"];
const now = Math.floor(Date.now() / 1000);

const companies = [];
const listings = [];
const scores = [];
const companySlugs = new Map();

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function companyId(name) {
  const slug = slugify(name);
  if (!companySlugs.has(slug)) {
    const id = companies.length + 1;
    companies.push({
      id,
      name,
      slug,
      domainFlag: false,
      domainNote: null,
      careersUrl: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    companySlugs.set(slug, id);
  }
  return companySlugs.get(slug);
}

for (const row of [...allRows, ...extras]) {
  const listingId = listings.length + 1;
  listings.push({
    id: listingId,
    companyId: companyId(row.company),
    title: row.role,
    url: row.link,
    linkType: row.link ? "stable" : "third_party",
    source: "indeed",
    sourceRef: null,
    location: null,
    remoteType: "unknown",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryStated: false,
    postedDate: null,
    expiresAt: null,
    deadlineSource: "none",
    status: "live",
    triage: row.tier ? "scored" : "logged_only",
    statusConfirmedAt: null,
    firstSeenAt: now,
    lastSeenAt: now,
    sightingCount: 1,
    outcome: "none",
    outcomeAt: null,
    rawText: null,
    embeddingStatus: "pending",
    embeddedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  if (row.tier) {
    scores.push({
      id: scores.length + 1,
      listingId,
      profileConfigId: 1,
      axes: Object.fromEntries(axisIds.map((id, i) => [id, row.axisScores[i] ?? null])),
      total: row.total,
      tier: row.tier,
      scoredBy: "manual",
      rationale: null,
      confidence: null,
      agentRunId: null,
      supersededBy: null,
      createdAt: now,
    });
  }
}

const data = { companies, listings, scores, queries: [], runs: [], sightings: [], notes: [], duplicates: [] };
writePrivateSeed(data);
console.log(
  `Parsed ${actRows.length} act / ${considerRows.length} consider / ${skipRows.length} skip rows ` +
    `from the scored tables (+ ${extras.length} manually-added rows). ` +
    "profile_config, queries, runs, sightings and notes are NOT populated — " +
    "extend this script or add them by hand before a real seed.",
);
