// Per-IP login attempt limiter, backed by KV. In-memory limiters don't work
// on Workers — each isolate can be dropped or cold-started at any time, and
// concurrent requests can land on different isolates entirely (see
// AGENTS.md §6: no module-scope mutable state).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

type AttemptRecord = { count: number; windowStart: number };

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** Subset of `KVNamespace` this module needs — keeps it testable with a fake. */
export type RateLimitKV = Pick<KVNamespace, "get" | "put">;

function keyFor(ip: string): string {
  return `login-attempts:${ip}`;
}

/**
 * Checks the fixed 15-minute window for `ip` and records this attempt if
 * it's allowed. Callers must check the login page **before** any password
 * comparison — a locked-out request should never reach
 * `constantTimeCompare`, so a lockout response can't leak anything about
 * how close the submitted password was.
 */
export async function checkAndRecordLoginAttempt(
  kv: RateLimitKV,
  ip: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const raw = await kv.get(keyFor(ip));
  let record: AttemptRecord = raw
    ? (JSON.parse(raw) as AttemptRecord)
    : { count: 0, windowStart: now };

  if (now - record.windowStart >= WINDOW_MS) {
    record = { count: 0, windowStart: now };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((record.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  record.count += 1;
  await kv.put(keyFor(ip), JSON.stringify(record), {
    expirationTtl: Math.ceil(WINDOW_MS / 1000),
  });

  return { allowed: true };
}

/** `CF-Connecting-IP` is set by Cloudflare on every request reaching the Worker. */
export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
