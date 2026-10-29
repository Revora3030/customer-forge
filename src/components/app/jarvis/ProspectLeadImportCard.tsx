import { useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importProspectLeadsFn, listProspectLeadQueueFn, reviewProspectLeadsFn } from "@/lib/prospect-lead-import.functions";
import { LEAD_COLUMNS_HELP, MAX_IMPORT_CHARS, blockLabel, type ImportSummary } from "@/lib/prospect-lead-import";

const KEY = ["jarvis", "lead-queue"] as const;

/**
 * Operations panel: leads collected elsewhere (the Grok bots' sheet, exported as
 * CSV). Importing checks them and parks them here; nothing is contacted. The
 * owner approves a batch, and only then do approved leads go through the
 * autopilot's own checks and limits.
 */
export function ProspectLeadImportCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const importFn = useServerFn(importProspectLeadsFn);
  const listFn = useServerFn(listProspectLeadQueueFn);
  const reviewFn = useServerFn(reviewProspectLeadsFn);
  const queue = useQuery({ queryKey: KEY, queryFn: () => listFn() });
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const importCsv = useMutation({
    mutationFn: () => importFn({ data: { csv, defaultCategory: category } }),
    onSuccess: (result) => {
      setSummary(result);
      setCsv("");
      setFileName("");
      toast.success(result.added ? `${result.added} lead${result.added === 1 ? "" : "s"} added for review.` : "No new leads were added.");
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't import that file."),
  });
  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") => reviewFn({ data: { ids: [...selected], decision } }),
    onSuccess: (result) => {
      toast[result.released || result.rejected ? "success" : "message"](result.message);
      setSelected(new Set());
      refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't update those leads."),
  });

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_CHARS) return void toast.error("That file is too large. Import up to 300 leads at a time.");
    setCsv(await file.text());
    setFileName(file.name);
  };
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const data = queue.data;
  const waiting = data?.leads.filter((lead) => lead.status !== "blocked").length ?? 0;
  const busy = review.isPending || importCsv.isPending;

  return (
    <details className={`rounded-xl border border-border bg-card ${className ?? ""}`}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
        <FileSpreadsheet className="h-4 w-4" aria-hidden />
        Import leads
        {waiting ? <span className="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">{waiting} to review</span> : null}
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Download your lead sheet as a CSV and add it here. Importing checks each lead and parks it below; nothing is contacted. Columns: {LEAD_COLUMNS_HELP}. Each lead needs a business, a city and a public email or website.
        </p>
        <div className="space-y-2 rounded-md border border-border p-3">
          <label className="block text-xs">
            CSV file
            <input className="mt-1 block min-h-11 w-full text-sm" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} />
          </label>
          {fileName ? <p className="text-xs text-muted-foreground">Ready to import: {fileName}</p> : null}
          <label className="block text-xs">
            …or paste the rows, header first
            <Textarea className="mt-1" rows={3} value={csv} onChange={(event) => { setCsv(event.target.value); setFileName(""); }} />
          </label>
          <label className="block text-xs">
            Trade for rows without a Category (optional)
            <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" autoComplete="off" placeholder="Plumbing" value={category} onChange={(event) => setCategory(event.target.value)} />
          </label>
          <Button size="sm" disabled={busy || !csv.trim()} onClick={() => importCsv.mutate()}>
            {importCsv.isPending ? "Checking leads…" : "Import and check"}
          </Button>
        </div>

        {summary ? (
          <div className="space-y-1 rounded-md border border-border p-3" role="status">
            <p className="font-medium">
              {summary.added} added · {summary.skippedCount} left out of {summary.read} rows{summary.truncated ? " (only the first 300 were read)" : ""}
            </p>
            {summary.skipped.length ? (
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {summary.skipped.map((item) => (
                  <li key={`${item.row}-${item.name}`}>Row {item.row}: {item.name} · {item.label}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {queue.isLoading ? <p className="text-muted-foreground">Loading the review queue…</p> : null}
        {queue.isError ? <p className="text-destructive">Couldn't load the review queue. If you just updated, the latest database migration may still need to be applied.</p> : null}
        {data ? (
          <>
            <p className="text-xs text-muted-foreground">
              {data.release.buildsLeftToday} new site{data.release.buildsLeftToday === 1 ? "" : "s"} left today · {data.release.pitchFirst ? "pitch first: a site is built only after the owner replies" : "demo first: a site is built before the pitch"} · up to {data.release.perTap} per tap.
              Approving makes a private demo for each lead that passes the checks. Nothing is sent from this page; the autopilot emails only when it is on, within its limits.
            </p>
            {!data.leads.length ? <p className="text-muted-foreground">No leads are waiting.</p> : null}
            <ul className="space-y-2">
              {data.leads.map((lead) => (
                <li key={lead.id} className="rounded-lg border border-border p-3">
                  <label className="flex min-h-11 items-start gap-3">
                    <input className="mt-1 size-5" type="checkbox" disabled={lead.status === "releasing"} checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} aria-label={`Select ${lead.businessName}`} />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{lead.businessName}</span>
                        <span className="text-xs text-muted-foreground">{[lead.city, lead.state].filter(Boolean).join(", ")}{lead.category ? ` · ${lead.category}` : ""}</span>
                        {lead.score !== null ? <span className="ml-auto text-xs uppercase tracking-wide text-muted-foreground">Fit {lead.score}/10</span> : null}
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">{[lead.email, lead.website, lead.phone].filter(Boolean).join(" · ")}</span>
                      {lead.notes ? <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">{lead.notes}</span> : null}
                      {lead.status === "releasing" ? <span className="block text-xs">Being released…</span> : null}
                      {lead.problem ? <span className="block text-xs text-destructive">{blockLabel(lead.problem)}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {data.leads.length ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy || !selected.size} onClick={() => review.mutate("approve")}>Approve selected</Button>
                <Button size="sm" variant="outline" disabled={busy || !selected.size} onClick={() => review.mutate("reject")}>Reject selected</Button>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">{data.counts.approved} approved · {data.counts.rejected} rejected · {data.counts.blocked} stopped at a check</p>
          </>
        ) : null}
      </div>
    </details>
  );
}
