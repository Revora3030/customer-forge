import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Cpu } from "lucide-react";
import { getJarvisRunEvents } from "@/lib/jarvis.functions";
import { answeringModel } from "@/lib/jarvis-model-label";

/** Shows the model that actually answered, read from the recorded run. */
export function ModelTag({ runId }: { runId: string }) {
  const load = useServerFn(getJarvisRunEvents);
  const q = useQuery({ queryKey: ["jarvis", "run", runId, "model"], queryFn: () => load({ data: { runId } }), staleTime: Infinity, retry: false });
  const found = answeringModel(q.data ?? []);
  if (!found) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
      <Cpu className="size-3" aria-hidden />
      <span className="sr-only">Answered by </span>
      {found.label}
      {found.backup ? " · backup" : ""}
    </p>
  );
}
