import "server-only";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  type Locale,
} from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

/**
 * The active locale for this request. proxy.ts resolves it (cookie or
 * Accept-Language) and forwards it on the `x-locale` request header, so that
 * value wins even on the first render before the cookie has round-tripped.
 * Falls back to the cookie, then the default.
 */
export async function getLocale(): Promise<Locale> {
  const fromHeader = (await headers()).get(LOCALE_HEADER);
  if (isLocale(fromHeader)) return fromHeader;

  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  return DEFAULT_LOCALE;
}

/** The dictionary for the active request locale. */
export async function getDict(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
