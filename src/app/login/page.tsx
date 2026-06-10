import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dumbbell } from "lucide-react";
import { loginAction } from "@/app/actions";
import { getDict } from "@/lib/i18n/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, t] = await Promise.all([searchParams, getDict()]);

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Dumbbell className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
            <p className="text-sm text-muted-foreground">{t.login.tagline}</p>
          </div>
        </div>

        <form action={loginAction} className="flex flex-col gap-3">
          <Input
            name="passcode"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder={t.login.passcode}
            aria-invalid={error ? true : undefined}
            className="h-12 text-center text-base"
          />
          {error && (
            <p className="text-center text-sm text-destructive">
              {t.login.wrong}
            </p>
          )}
          <Button type="submit" className="h-12 w-full text-base">
            {t.login.unlock}
          </Button>
        </form>
      </div>
    </div>
  );
}
