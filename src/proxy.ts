import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isValidSessionValue } from "@/lib/auth";

// Gate every page behind the passcode. Runs on the Node.js runtime (the v16
// default for proxy), so node:crypto in @/lib/auth is available here.
export function proxy(request: NextRequest) {
  const authed = isValidSessionValue(request.cookies.get(AUTH_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (authed) {
    // Don't show the login screen to someone who's already in.
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Unauthenticated: only the login page (and its form POST) is reachable.
  if (pathname === "/login") return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    // Everything except Next internals, the manifest, and icon assets.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)",
  ],
};
