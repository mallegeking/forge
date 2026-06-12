import { Flame } from "lucide-react";
import { loginAction } from "@/app/actions";
import { getDict } from "@/lib/i18n/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, t] = await Promise.all([searchParams, getDict()]);

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center px-1.5 animate-[fadeIn_0.3s_ease]">
      <div className="w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center gap-3 text-center">
          <Flame className="size-9 text-primary" fill="currentColor" />
          <div>
            <h1 className="font-display text-[34px] font-bold tracking-[0.18em] uppercase">
              Forge
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t.login.tagline}
            </p>
          </div>
        </div>

        <form action={loginAction} className="flex flex-col gap-3">
          <input
            name="passcode"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder={t.login.passcode}
            aria-invalid={error ? true : undefined}
            className="h-12 rounded-[13px] bg-card px-4 text-center text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          {error && (
            <p className="text-center text-sm text-destructive">
              {t.login.wrong}
            </p>
          )}
          <button
            type="submit"
            className="flex h-[50px] w-full items-center justify-center rounded-[12px] bg-primary text-primary-foreground transition-transform active:scale-[0.98]"
          >
            <span className="font-display text-[19px] font-semibold tracking-[0.14em] uppercase">
              {t.login.unlock}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
