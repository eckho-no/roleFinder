// Constant-time secret comparison for edge runtimes.
//
// Never compare submitted-vs-expected secrets with `===` on raw strings —
// JS string equality short-circuits on the first mismatched byte, which
// leaks the length of the matching prefix through response timing. Node's
// `crypto.timingSafeEqual` would fix that, but `node:crypto` isn't
// available (or allowed — see AGENTS.md §6) in the Workers runtime.
//
// Instead: HMAC both the submitted value and the expected value with the
// same random per-call key, then compare the resulting digests byte-by-byte
// without early-exit. HMAC output is fixed-length (32 bytes for SHA-256)
// regardless of input length, so the comparison loop always runs the same
// number of iterations, and a mismatched input never reveals *where* it
// diverges from the expected value.
//
// The per-call random key means this function is safe to call even when
// `submitted` is empty or missing — there is no early return, so a blank
// password takes the same code path (and, modulo scheduler noise, the same
// time) as a wrong one.

async function hmacDigest(key: CryptoKey, message: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}

/**
 * Compares `submitted` against `expected` in constant time by HMAC-ing both
 * with the same ephemeral key and comparing the resulting digests without
 * short-circuiting. Returns `false` (never throws) for any falsy/empty
 * `submitted` input rather than skipping the compare.
 */
export async function constantTimeCompare(
  submitted: string | null | undefined,
  expected: string,
): Promise<boolean> {
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const [submittedDigest, expectedDigest] = await Promise.all([
    hmacDigest(key, submitted ?? ""),
    hmacDigest(key, expected),
  ]);

  return constantTimeEqualBytes(
    new Uint8Array(submittedDigest),
    new Uint8Array(expectedDigest),
  );
}

/** Byte-array equality that always inspects every byte of both arrays. */
function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  // Digests are fixed-length outputs of the same algorithm, so this branch
  // never depends on the *content* of either secret — only on a static
  // property (byte length) of the hash function itself.
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
