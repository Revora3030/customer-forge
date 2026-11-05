import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Panel } from "@/components/app/Bits";
import { getProspectBoard, getProspectPipeline } from "@/lib/jarvis-demo-site.functions";
import { reviewProspectLeadsFn } from "@/lib/prospect-lead-import.functions";
import { BOARD_STAGES } from "@/lib/prospect-board";

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
    <Panel aria-labelledby="pipeline-heading">
      <h2 id="pipeline-heading" className="mb-1 text-base font-semibold">Lead pipeline</h2>
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
      <ProspectBoard />
    </Panel>
  );
}

/** JC-58: Kanban of prospects. Cards move only when existing actions write records; the only button is the existing lead approval (it sends nothing). */
function ProspectBoard() {
  const boardFn = useServerFn(getProspectBoard);
  const reviewFn = useServerFn(reviewProspectLeadsFn);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "prospect-board"], queryFn: () => boardFn(), staleTime: 60000 });
  const approve = useMutation({
    mutationFn: (id: string) => reviewFn({ data: { ids: [id], decision: "approve" } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "prospect-board"] }),
  });
  if (q.isError) return <p role="alert" className="mt-3 text-sm text-destructive">Couldn't load the board. Try again shortly.</p>;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold">Board</h3>
      <div className="grid gap-2 overflow-x-auto sm:grid-cols-5">
        {BOARD_STAGES.map(([stage, label]) => {
          const cards = q.data?.[stage] ?? [];
          return (
            <section key={stage} aria-label={label} className="min-w-40 rounded-md border border-border p-2">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">{label} ({q.data ? cards.length : "…"})</h4>
              <ul className="space-y-1.5">
                {cards.slice(0, 50).map((card) => (
                  <li key={card.key} className="rounded border border-border bg-background p-1.5 text-xs">
                    <span className="block truncate">{card.name}</span>
                    {card.leadId ? (
                      <button
                        type="button"
                        className="mt-1 text-primary underline disabled:opacity-50"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(card.leadId as string)}
                      >
                        Approve lead
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {approve.isError ? <p role="alert" className="mt-2 text-xs text-destructive">Couldn't approve that lead.</p> : null}
    </div>
  );
}
