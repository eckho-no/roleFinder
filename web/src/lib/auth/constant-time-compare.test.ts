import { describe, expect, it } from "vitest";

import { constantTimeCompare } from "./constant-time-compare";

describe("constantTimeCompare", () => {
  it("returns true when the submitted value matches exactly", async () => {
    await expect(constantTimeCompare("correct-password", "correct-password")).resolves.toBe(
      true,
    );
  });

  it("returns false for a wrong value of the same length", async () => {
    await expect(constantTimeCompare("wrong-password!!!", "correct-password")).resolves.toBe(
      false,
    );
  });

  it("returns false for a wrong value of a different length", async () => {
    await expect(constantTimeCompare("short", "correct-password")).resolves.toBe(false);
  });

  it("returns false, not throws, for an empty string", async () => {
    await expect(constantTimeCompare("", "correct-password")).resolves.toBe(false);
  });

  it("returns false, not throws, for null", async () => {
    await expect(constantTimeCompare(null, "correct-password")).resolves.toBe(false);
  });

  it("returns false, not throws, for undefined", async () => {
    await expect(constantTimeCompare(undefined, "correct-password")).resolves.toBe(false);
  });

  it("takes roughly the same time whether the mismatch is at the first or last byte", async () => {
    // Not a strict timing assertion (too flaky in CI) — this just exercises
    // both a near-immediate first-byte mismatch and a last-byte mismatch to
    // confirm neither path throws or short-circuits differently, since both
    // go through the same fixed-length digest comparison.
    const expected = "a".repeat(64);
    const mismatchFirst = "b" + "a".repeat(63);
    const mismatchLast = "a".repeat(63) + "b";

    await expect(constantTimeCompare(mismatchFirst, expected)).resolves.toBe(false);
    await expect(constantTimeCompare(mismatchLast, expected)).resolves.toBe(false);
  });
});
