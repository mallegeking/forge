import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isValidSessionValue } from "@/lib/auth";
import {
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  pickLocale,
} from "@/lib/i18n/config";

// Gate every page behind the passcode. Runs on the Node.js runtime (the v16
// default for proxy), so node:crypto in @/lib/auth is available here.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Resolve the locale once per request: an explicit cookie (set by the
  // language switcher or a previous auto-detect) wins; otherwise sniff the
  // browser's Accept-Language. We forward the result on a request header so
  // the first render sees it, and persist it as a cookie when auto-detected.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : pickLocale(request.headers.get("accept-language"));
  const needsCookie = cookieLocale !== locale;

  const withLocaleCookie = (res: NextResponse) => {
    if (needsCookie) {
      res.cookies.set(LOCALE_COOKIE, locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  };

  const proceed = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(LOCALE_HEADER, locale);
    return withLocaleCookie(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  };

  const authed = isValidSessionValue(request.cookies.get(AUTH_COOKIE)?.value);

  if (authed) {
    // Don't show the login screen to someone who's already in.
    if (pathname === "/login") {
      return withLocaleCookie(NextResponse.redirect(new URL("/", request.url)));
    }
    return proceed();
  }

  // Unauthenticated: only the login page (and its form POST) is reachable.
  if (pathname === "/login") return proceed();
  return withLocaleCookie(NextResponse.redirect(new URL("/login", request.url)));
}

export const config = {
  matcher: [
    // Everything except Next internals, the manifest, and icon assets.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-icon.png).*)",
  ],
};
