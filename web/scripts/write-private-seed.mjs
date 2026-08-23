#!/usr/bin/env node
// Safety wrapper for writing real board data to disk. Never import this to
// write anywhere other than data/private/ — it exists specifically to make
// that mistake hard rather than to be a generic file writer.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT_PATH = `${REPO_ROOT}data/private/seed.local.json`;

function assertGitignored(path) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", path], { cwd: REPO_ROOT });
  } catch (err) {
    if (err.status === 1) {
      throw new Error(
        `refusing to write: ${path} is NOT gitignored. This must never be ` +
          "committed — check .gitignore before running this again.",
      );
    }
    throw err;
  }
}

export function writePrivateSeed(data) {
  assertGitignored(OUTPUT_PATH);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2) + "\n");
  // Re-assert after writing too — belt and braces against a mid-run
  // .gitignore edit, or this script being copy-pasted somewhere unsafe.
  assertGitignored(OUTPUT_PATH);
  console.log(`Wrote ${data.listings?.length ?? 0} listings to ${OUTPUT_PATH} (gitignored, confirmed).`);
  return OUTPUT_PATH;
}
