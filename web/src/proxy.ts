import { NextResponse, type NextRequest } from "next/server";

import { requireSession, UnauthorizedError } from "@/lib/auth/require-session";

// Routes reachable without a session. Keep this list short and explicit —
// everything else, including `/`, requires a valid `rf_session` cookie.
const PUBLIC_PATHS = new Set(["/api/auth/login"]);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  try {
    await requireSession(request);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    throw error;
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next.js internals and static assets — deliberately
  // broad. New routes are protected by default; opt out via PUBLIC_PATHS,
  // not by editing this matcher.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
