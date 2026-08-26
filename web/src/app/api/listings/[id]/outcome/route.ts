import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { listings } from "@/db/schema/core";
import { outcomeSchema } from "@/db/schema/unions";
import { databaseForSession } from "@/lib/auth/database-for-session";
import {
  ReadOnlySessionError,
  UnauthorizedError,
  requireWritableSession,
} from "@/lib/auth/require-session";

type OutcomeResult = { ok: true } | { ok: false; error: string };

function errorResponse(status: number, error: string): NextResponse<OutcomeResult> {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * Updates a listing's `outcome` (and stamps `outcomeAt`). This is the only
 * write in the listing detail feature — gated by `requireWritableSession`
 * (not `requireSession`) so a demo session's read-only role is enforced
 * independently of whatever the UI does or doesn't render, matching every
 * other write route in this codebase (see require-session.ts).
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/listings/[id]/outcome">,
): Promise<NextResponse<OutcomeResult>> {
  const { env } = await getCloudflareContext({ async: true });

  let session;
  try {
    session = await requireWritableSession(request);
  } catch (error) {
    if (error instanceof UnauthorizedError) return errorResponse(401, "unauthorized");
    if (error instanceof ReadOnlySessionError) return errorResponse(403, "read_only_session");
    throw error;
  }

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    return errorResponse(400, "invalid_listing_id");
  }

  const body: unknown = await request.json().catch(() => null);
  const outcomeField =
    typeof body === "object" && body !== null && "outcome" in body
      ? (body as { outcome: unknown }).outcome
      : undefined;
  const parsed = outcomeSchema.safeParse(outcomeField);
  if (!parsed.success) {
    return errorResponse(400, "invalid_outcome");
  }

  const db = getDb(databaseForSession(session, env));

  const [existing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  if (!existing) {
    return errorResponse(404, "listing_not_found");
  }

  await db
    .update(listings)
    .set({ outcome: parsed.data, outcomeAt: new Date(), updatedAt: new Date() })
    .where(eq(listings.id, listingId));

  return NextResponse.json({ ok: true }, { status: 200 });
}
