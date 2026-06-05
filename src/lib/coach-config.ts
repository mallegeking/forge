// Server-side coach config: layers the in-app settings (stored in the `settings`
// table by the /settings screen) over env vars, so the user can connect/switch
// the coach's provider from the UI instead of editing .env.local. Non-empty DB
// values win. The route handler and the "test connection" action both call
// getCoachProvider(); the pure merge + resolution lives in coach-provider.ts.

import { getSetting } from "@/lib/mutations";
import { resolveCoachProviderWith, type CoachProvider } from "@/lib/coach-provider";

const KEYS = {
  provider: "coachProvider",
  model: "coachModel",
  apiKey: "coachApiKey",
  baseUrl: "coachBaseUrl",
} as const;

export async function getCoachProvider(): Promise<CoachProvider | null> {
  const [provider, model, apiKey, baseUrl] = await Promise.all([
    getSetting(KEYS.provider),
    getSetting(KEYS.model),
    getSetting(KEYS.apiKey),
    getSetting(KEYS.baseUrl),
  ]);
  return resolveCoachProviderWith(process.env, { provider, model, apiKey, baseUrl });
}

export type CoachSettingsView = {
  provider: string;
  model: string;
  baseUrl: string;
  /** Whether a key is saved — the key itself is never sent to the client. */
  hasKey: boolean;
};

export async function getCoachSettings(): Promise<CoachSettingsView> {
  const [provider, model, baseUrl, apiKey] = await Promise.all([
    getSetting(KEYS.provider),
    getSetting(KEYS.model),
    getSetting(KEYS.baseUrl),
    getSetting(KEYS.apiKey),
  ]);
  return {
    provider: provider ?? "",
    model: model ?? "",
    baseUrl: baseUrl ?? "",
    hasKey: !!apiKey,
  };
}
