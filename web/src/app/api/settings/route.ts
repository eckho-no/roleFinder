import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseForSession } from "@/lib/auth/database-for-session";
import {
  ReadOnlySessionError,
  requireWritableSession,
  UnauthorizedError,
} from "@/lib/auth/require-session";
import { getDb } from "@/db/client";
import {
  ProfileConfigConflictError,
  writeProfileConfigVersion,
} from "@/lib/settings/write-profile-config";

const profileAxisSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  max: z.number(),
  weight: z.number(),
});

const locationRulesSchema = z.object({
  commutable: z.array(z.string()),
  notCommutable: z.array(z.string()),
  radiusMiles: z.number(),
  londonRule: z.string(),
});

// Boundary validator for the settings write — same role as the Zod schemas
// in db/schema/unions.ts, just for a request body instead of a union
// column. `positioning` stays a free-form record: it's the one field in
// `profile_config` that's genuinely open-ended (see scoring.ts).
const profileConfigBodySchema = z.object({
  titles: z.array(z.string().min(1)).min(1),
  locationRules: locationRulesSchema,
  salaryFloor: z.number().int().nonnegative(),
  salaryHardFloor: z.number().int().nonnegative(),
  positioning: z.record(z.string(), z.unknown()),
  axes: z.array(profileAxisSchema).min(1),
  tierThresholds: z.object({ act: z.number(), consider: z.number() }),
  note: z.string().nullable().optional(),
});

type WriteResult = { ok: true; version: number } | { ok: false; error: string };

function errorResponse(error: string, status: number): NextResponse<WriteResult> {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request): Promise<NextResponse<WriteResult>> {
  let session;
  try {
    session = await requireWritableSession(request);
  } catch (error) {
    if (error instanceof ReadOnlySessionError) {
      // Demo sessions never reach the write path — enforced here
      // independently of whatever the UI shows, per requireWritableSession's
      // contract (see require-session.ts).
      return errorResponse("Demo sessions are read-only", 403);
    }
    if (error instanceof UnauthorizedError) {
      return errorResponse("Unauthorized", 401);
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Malformed JSON body", 400);
  }

  const parsed = profileConfigBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(`Invalid profile config: ${parsed.error.message}`, 400);
  }

  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  try {
    const written = await writeProfileConfigVersion(db, {
      ...parsed.data,
      createdBy: session.role,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ ok: true, version: written.version }, { status: 200 });
  } catch (error) {
    if (error instanceof ProfileConfigConflictError) {
      return errorResponse(error.message, 409);
    }
    throw error;
  }
}
