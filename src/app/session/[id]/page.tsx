import { notFound } from "next/navigation";
import { getSessionView } from "@/lib/queries";
import { SessionView } from "@/components/session/session-view";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const view = await getSessionView(id);
  if (!view) notFound();
  return <SessionView view={view} />;
}
