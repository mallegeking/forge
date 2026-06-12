import { notFound } from "next/navigation";
import {
  getSessionView,
  getProgramDays,
  getProgramDayCounts,
  getCompletedDayIdsThisWeek,
  isoWeekday,
} from "@/lib/queries";
import { SessionView } from "@/components/session/session-view";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await getSessionView(id);
  if (!view) notFound();

  // Extra context for the "Forged" receipt: weekly progress + what's next.
  const [days, counts, completedDayIds] = await Promise.all([
    getProgramDays(view.session.programId),
    getProgramDayCounts(view.session.programId),
    getCompletedDayIdsThisWeek(view.session.programId),
  ]);

  const today = isoWeekday();
  // The next training day in the rotation after today (wraps around the week).
  const ordered = [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const nextDay =
    ordered.find((d) => d.dayOfWeek > today) ?? ordered[0] ?? null;

  // Week progress as it will read once THIS session completes. Counting by day
  // id (not +1 blindly) keeps it right when a day is re-done in the same week.
  const weekDoneAfter = completedDayIds.has(view.session.dayId)
    ? completedDayIds.size
    : completedDayIds.size + 1;

  return (
    <SessionView
      view={view}
      weekTotal={days.length}
      weekDoneAfter={weekDoneAfter}
      exerciseCount={counts.get(view.session.dayId) ?? view.exercises.length}
      nextDay={nextDay ? { name: nextDay.name, weekday: nextDay.dayOfWeek } : null}
    />
  );
}
