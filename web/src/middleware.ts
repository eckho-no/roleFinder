import { NextResponse, type NextRequest } from "next/server";

import { requireSession, UnauthorizedError } from "@/lib/auth/require-session";

// Next.js 16 renamed this file convention to `proxy.ts` and hard-locks it to
// the Node.js runtime with no override (see
// node_modules/next/dist/build/analysis/get-page-static-info.js — setting
// `runtime` in a Proxy file throws). @opennextjs/cloudflare@1.20.2 doesn't
// support Node.js middleware yet ("Node.js middleware is not currently
// supported" — @opennextjs/cloudflare/dist/cli/build/build.js), so a
// `proxy.ts` file fails `opennextjs-cloudflare build` outright. The legacy
// `middleware.ts` name still defaults to the Edge runtime, which OpenNext's
// Cloudflare adapter does support — kept intentionally despite the
// deprecation warning until OpenNext adds Node.js middleware support.

// Routes reachable without a session. Keep this list short and explicit —
// everything else, including `/`, requires a valid `rf_session` cookie.
const PUBLIC_PATHS = new Set(["/api/auth/login"]);

export async function middleware(request: NextRequest): Promise<NextResponse> {
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
