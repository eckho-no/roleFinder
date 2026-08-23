#!/usr/bin/env node
// Generates fixtures/seed.synthetic.json — fabricated data shaped like the
// real board (tier distribution, salary-stated ratio, a stale listing, a
// duplicated req), per PLAN_2.0.md §3. Every name/number here is made up;
// nothing is copied from the private tracker. Re-run after editing to
// regenerate the committed fixture: `node scripts/generate-synthetic-fixture.mjs`
import { writeFileSync } from "node:fs";

const DAY = 24 * 60 * 60;
const now = Math.floor(Date.parse("2026-08-20T09:00:00Z") / 1000);
const ts = (daysAgo) => now - daysAgo * DAY;

const profileConfig = [
  {
    id: 1,
    version: 1,
    isCurrent: true,
    titles: [
      "Forward Deployed Engineer",
      "Applied AI Engineer",
      "Solutions Engineer (AI)",
      "Founding Engineer",
    ],
    locationRules: {
      commutable: ["Reading", "Oxford", "Basingstoke", "Slough"],
      notCommutable: ["Manchester", "Glasgow", "Edinburgh"],
      radiusMiles: 40,
      londonRule: "Acceptable if remote-first or at most 2 days a month",
    },
    salaryFloor: 65000,
    salaryHardFloor: 55000,
    positioning: { leadWith: "a synthetic portfolio product", note: "example only" },
    axes: [
      { id: "role_shape", label: "Role shape", description: "Embedded, end-to-end ownership", max: 5, weight: 1 },
      { id: "variety_autonomy", label: "Variety & autonomy", description: "Roams across problems", max: 5, weight: 1 },
      { id: "stack_fit", label: "Stack fit", description: "TypeScript/Node/serverless", max: 5, weight: 1 },
      { id: "location", label: "Location", description: "UK remote or commutable", max: 5, weight: 1 },
      { id: "flexibility", label: "Flexibility", description: "Sets own hours", max: 5, weight: 1 },
      { id: "money", label: "Money", description: "Meets or exceeds floor", max: 5, weight: 1 },
    ],
    tierThresholds: { act: 22, consider: 16 },
    createdAt: ts(30),
    createdBy: "manual",
    note: "Synthetic seed profile — fabricated for the public repo, see PLAN_2.0.md §3",
  },
];

const runs = [1, 2, 3].map((n) => ({
  id: n,
  runNumber: n,
  label: `Synthetic run ${n}`,
  kind: "full",
  startedAt: ts(21 - n * 7),
  completedAt: ts(21 - n * 7) + 3600,
  summary: `Synthetic full run ${n} — fabricated for seed data`,
  source: "seed",
  stats: { newListings: 5 + n },
}));

const queryTexts = [
  "forward deployed engineer",
  "applied AI engineer",
  "AI solutions architect",
  "agentic engineer",
  "AI implementation specialist",
  "platform engineer AI",
  "founding engineer AI startup",
  "AI product engineer",
  "GenAI solutions engineer",
  "workflow automation engineer",
  "AI enablement lead",
  "automation architect",
];
const queries = queryTexts.map((text, i) => ({
  id: i + 1,
  text,
  source: "indeed",
  isActive: i < 10, // last two retired, mirrors "5 of 12 produced nothing" being a real coach action
  addedInRunId: 1,
  retiredInRunId: i < 10 ? null : 3,
  notes: null,
  createdAt: ts(28),
}));

const companyNames = [
  "Northwind Analytics",
  "Fernbridge Systems",
  "Cobalt Path AI",
  "Verdant Logic",
  "Ashcroft Digital",
  "Meridian Stack Co",
  "Palefire Technologies",
  "Brightlane Robotics",
  "Kestrel Data Works",
  "Amber Route Solutions",
  "Thistledown Labs",
  "Ironwood Cloud",
  "Halcyon Systems",
  "Driftwood AI",
  "Sable Peak Technologies",
];
const companies = companyNames.map((name, i) => ({
  id: i + 1,
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  domainFlag: i % 5 === 0,
  domainNote: i % 5 === 0 ? "logistics" : null,
  careersUrl: `https://example.com/${i + 1}/careers`,
  notes: null,
  createdAt: ts(28),
  updatedAt: ts(28),
}));

// 30 listings: 4 act, 15 consider, 3 skip, 6 logged_only/unknown (never
// scored — "the tracker's single largest category"), with 2 closed
// (one of them the stale example) and one duplicated pair among them.
const remoteTypes = ["remote", "hybrid", "onsite"];
const listings = [];
const scores = [];
const sightings = [];
let sightingId = 1;

function addListing({ id, companyId, title, tier, total, status, triage, salaryStated, postedDaysAgo, closedStale }) {
  const firstSeen = ts(postedDaysAgo);
  const lastSeen = closedStale ? ts(0) : ts(Math.max(postedDaysAgo - 14, 0));
  listings.push({
    id,
    companyId,
    title,
    url: `https://example.com/jobs/${id}`,
    linkType: "stable",
    source: "indeed",
    sourceRef: `synthetic-${id}`,
    location: remoteTypes[id % 3] === "remote" ? null : "Reading, UK",
    remoteType: remoteTypes[id % 3],
    salaryMin: salaryStated ? 60000 + (id % 5) * 2000 : null,
    salaryMax: salaryStated ? 75000 + (id % 5) * 2000 : null,
    salaryCurrency: salaryStated ? "GBP" : null,
    salaryPeriod: salaryStated ? "year" : null,
    salaryStated,
    postedDate: firstSeen,
    expiresAt: status === "live" && id % 4 === 0 ? ts(-10) : null, // a few "closing soon"
    deadlineSource: status === "live" && id % 4 === 0 ? "stated" : "none",
    status,
    triage,
    statusConfirmedAt: status === "closed" ? ts(closedStale ? 12 : 3) : null,
    firstSeenAt: firstSeen,
    lastSeenAt: lastSeen,
    sightingCount: 0, // filled in after sightings are generated
    outcome: "none",
    outcomeAt: null,
    rawText: `Synthetic job description for ${title}.`,
    embeddingStatus: "pending",
    embeddedAt: null,
    createdAt: firstSeen,
    updatedAt: lastSeen,
  });

  if (triage === "scored") {
    scores.push({
      id: scores.length + 1,
      listingId: id,
      profileConfigId: 1,
      axes: { role_shape: 4, variety_autonomy: 4, stack_fit: 4, location: 3, flexibility: 3, money: total >= 22 ? 4 : 2 },
      total,
      tier,
      scoredBy: "manual",
      rationale: "Synthetic rationale for seed data.",
      confidence: 0.8,
      agentRunId: null,
      supersededBy: null,
      createdAt: firstSeen + 3600,
    });
  }

  return id;
}

let nextId = 1;
const titleWords = ["Forward Deployed Engineer", "Applied AI Engineer", "AI Solutions Engineer", "Founding Engineer", "AI Product Engineer", "Automation Architect"];

// 4 Act tier
for (let i = 0; i < 4; i++) {
  addListing({
    id: nextId,
    companyId: (nextId % companies.length) + 1,
    title: titleWords[i % titleWords.length],
    tier: "act",
    total: 22 + i,
    status: "live",
    triage: "scored",
    salaryStated: i % 2 === 0,
    postedDaysAgo: 10 + i,
  });
  nextId++;
}

// 15 Consider tier
for (let i = 0; i < 15; i++) {
  addListing({
    id: nextId,
    companyId: (nextId % companies.length) + 1,
    title: titleWords[i % titleWords.length],
    tier: "consider",
    total: 16 + (i % 6),
    status: "live",
    triage: "scored",
    salaryStated: i % 6 === 0,
    postedDaysAgo: 5 + (i % 20),
  });
  nextId++;
}

// 3 Skip tier
for (let i = 0; i < 3; i++) {
  addListing({
    id: nextId,
    companyId: (nextId % companies.length) + 1,
    title: titleWords[i % titleWords.length],
    tier: "skip",
    total: 10 + i,
    status: "live",
    triage: "scored",
    salaryStated: false,
    postedDaysAgo: 3 + i,
  });
  nextId++;
}

// 18 logged_only / unknown — never scored. This is deliberately the
// largest single bucket, mirroring the real board's largest category:
// surfaced but never scorable because the JD was never reachable.
for (let i = 0; i < 18; i++) {
  addListing({
    id: nextId,
    companyId: (nextId % companies.length) + 1,
    title: titleWords[i % titleWords.length],
    tier: null,
    total: null,
    status: "unknown",
    triage: "logged_only",
    salaryStated: false,
    postedDaysAgo: 2 + i,
  });
  nextId++;
}
// scores array only got entries for triage === "scored"; strip nulls path (no-op, addListing already guards)

// 2 closed — one of them the stale example (sightings continue well past
// status_confirmed_at, mirroring the real drift-detection scenario)
addListing({
  id: nextId,
  companyId: (nextId % companies.length) + 1,
  title: "AI Implementation Engineer",
  tier: "consider",
  total: 20,
  status: "closed",
  triage: "scored",
  salaryStated: false,
  postedDaysAgo: 20,
});
nextId++;

const staleListingId = nextId;
addListing({
  id: nextId,
  companyId: (nextId % companies.length) + 1,
  title: "Staff AI Engineer",
  tier: "act",
  total: 24,
  status: "closed",
  triage: "scored",
  salaryStated: false,
  postedDaysAgo: 25,
  closedStale: true,
});
nextId++;

// Duplicate pair: one recruiter req resurfacing under a near-identical
// posting, surfaced across three queries in a single run.
const dupOriginalId = nextId;
const dupCompanyId = (nextId % companies.length) + 1;
addListing({
  id: nextId,
  companyId: dupCompanyId,
  title: "AI Automation Engineer",
  tier: "consider",
  total: 19,
  status: "live",
  triage: "scored",
  salaryStated: false,
  postedDaysAgo: 15,
});
nextId++;

const dupCopyId = nextId;
addListing({
  id: nextId,
  companyId: dupCompanyId, // same company, different req — a recruiter re-listing
  title: "AI Automation Engineer (Contract)",
  tier: null,
  total: null,
  status: "unknown",
  triage: "merged",
  salaryStated: false,
  postedDaysAgo: 14,
});
nextId++;

const duplicates = [
  {
    id: 1,
    listingId: dupCopyId,
    duplicateOfListingId: dupOriginalId,
    method: "vector",
    similarity: 0.94,
    status: "confirmed",
    agentRunId: null,
    createdAt: ts(13),
  },
];

// Sightings: a handful per listing across the 3 runs/queries. The stale
// listing gets sightings *after* its status_confirmed_at. The duplicate's
// original listing gets three sightings in run 2 across three queries.
for (const listing of listings) {
  const sightingsForListing =
    listing.id === staleListingId
      ? [
          { runId: 1, queryId: 1, daysAgo: 25 },
          { runId: 2, queryId: 1, daysAgo: 12 }, // status_confirmed_at was ts(12) — this is the boundary
          { runId: 3, queryId: 2, daysAgo: 6 }, // continues sighting 6 days after confirmed-closed
          { runId: 3, queryId: 3, daysAgo: 0 }, // and again at report time — 12+ days of drift
        ]
      : listing.id === dupOriginalId
        ? [
            { runId: 2, queryId: 3, daysAgo: 15 },
            { runId: 2, queryId: 9 > queries.length ? 5 : 9, daysAgo: 15 },
            { runId: 2, queryId: 10 > queries.length ? 6 : 10, daysAgo: 15 },
          ]
        : [{ runId: 1, queryId: (listing.id % queries.length) + 1, daysAgo: Math.floor((now - listing.firstSeenAt) / DAY) }];

  for (const s of sightingsForListing) {
    sightings.push({
      id: sightingId++,
      listingId: listing.id,
      runId: s.runId,
      queryId: s.queryId,
      source: "indeed",
      seenAt: ts(s.daysAgo),
      rawSnippet: `Synthetic sighting snippet for listing ${listing.id}.`,
    });
  }
  listing.sightingCount = sightingsForListing.length;
}

const notes = [
  {
    id: 1,
    listingId: listings[0].id,
    companyId: null,
    type: "judgment_call",
    body: "Synthetic judgment call: contract-vs-permanent shape, unanswered for two runs.",
    createdBy: "manual",
    agentRunId: null,
    createdAt: ts(10),
  },
  {
    id: 2,
    listingId: staleListingId,
    companyId: null,
    type: "currency_check",
    body: "Synthetic note: listing still surfacing well after being confirmed closed.",
    createdBy: "manual",
    agentRunId: null,
    createdAt: ts(6),
  },
];

const fixture = {
  profileConfig,
  runs,
  queries,
  companies,
  listings,
  scores,
  sightings,
  notes,
  duplicates,
};

writeFileSync(
  new URL("../fixtures/seed.synthetic.json", import.meta.url),
  JSON.stringify(fixture, null, 2) + "\n",
);

console.log(
  `Generated fixture: ${companies.length} companies, ${listings.length} listings, ${scores.length} scores, ${sightings.length} sightings, ${queries.length} queries, ${runs.length} runs, ${notes.length} notes, ${duplicates.length} duplicates.`,
);
