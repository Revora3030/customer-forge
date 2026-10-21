import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Panel } from "@/components/app/Bits";
import { getProspectPipeline } from "@/lib/jarvis-demo-site.functions";

const STAGES = [
  ["searchesLast30Days", "Searches (30 days)"],
  ["demosCreated", "Demos created"],
  ["demosBuilt", "Demos finished"],
  ["demosFailed", "Demo builds failed"],
  ["businessesEmailed", "Businesses emailed"],
  ["emailsFailed", "Emails failed"],
  ["optedOut", "Opted out"],
  ["previewsOpened", "Previews opened"],
  ["businessesReplied", "Replied"],
  ["demosClaimed", "Demos claimed"],
  ["paidCustomers", "Paid customers"],
] as const;

export function ProspectPipelinePanel() {
  const fn = useServerFn(getProspectPipeline);
  const q = useQuery({ queryKey: ["admin", "prospect-pipeline"], queryFn: () => fn(), staleTime: 60000 });
  return (
    <Panel title="Lead pipeline">
      <p className="mb-3 text-xs text-muted-foreground">Counted from saved records. A sent email isn't proof it was read, and a demo isn't a customer until it's claimed and paid.</p>
      {q.isError ? (
        <p role="alert" className="text-sm text-destructive">Couldn't load the pipeline. Try again shortly.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {STAGES.map(([key, label]) => (
            <div key={key} className="rounded-md border border-border p-2.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{q.data ? q.data[key] : "…"}</dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}
