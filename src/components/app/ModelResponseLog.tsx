/**
 * Model response log.
 *
 * Shows, in plain words, which model answered each builder request: the page
 * plan and layout, each section, the wording, the search details and every
 * picture — newest first, with whether it worked. Nothing here is estimated.
 */
import { useMemo, useState } from "react";
import { Panel, Pill, SectionHeading, EmptyState, ErrorNote, LoadingRows } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { useBuilderModelLog } from "@/lib/ai/model-log.hooks";
import type { ModelLogEntry, ModelLogScope } from "@/lib/ai/model-log.functions";
import { ScrollText } from "lucide-react";

const FILTERS: { key: ModelLogScope | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "layout", label: "Layout & pages" },
  { key: "section", label: "Sections" },
  { key: "image", label: "Pictures" },
  { key: "copy", label: "Wording" },
  { key: "metadata", label: "Search details" },
];

function when(at: string) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({ entry }: { entry: ModelLogEntry }) {
  return (
    <li className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1 text-[13px]">
        <span className="block truncate font-medium">{entry.label}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
          {when(entry.at)}
          {entry.latencyMs != null ? ` · ${(entry.latencyMs / 1000).toFixed(1)}s` : ""}
          {entry.note ? ` · ${entry.note}` : ""}
        </span>
      </span>
      <span className="tnum shrink-0 font-mono text-[11px] text-muted-foreground">
        {entry.provider ? `${entry.provider} · ` : ""}
        {entry.model}
      </span>
      <Pill tone={entry.ok ? "signal" : "danger"} dot>
        {entry.ok ? "Done" : "Didn't work"}
      </Pill>
    </li>
  );
}

export function ModelResponseLog({ organizationId }: { organizationId: string | undefined }) {
  const [filter, setFilter] = useState<ModelLogScope | "all">("all");
  const log = useBuilderModelLog(organizationId);

  const entries = useMemo(() => {
    const all = log.data?.entries ?? [];
    return filter === "all" ? all : all.filter((entry) => entry.scope === filter);
  }, [log.data, filter]);

  return (
    <Panel>
      <SectionHeading
        eyebrow="Model log"
        title="Which model made each change"
        description="Every layout, section, wording and picture request, and the model that answered it."
        action={
          <Button size="sm" variant="outline" onClick={() => void log.refetch()}>
            Refresh
          </Button>
        }
      />

      {log.isLoading ? (
        <div className="mt-4">
          <LoadingRows rows={3} />
        </div>
      ) : log.error ? (
        <div className="mt-4">
          <ErrorNote message="Couldn't read the model log right now. Try refresh in a moment." />
        </div>
      ) : log.data?.empty ? (
        <div className="mt-4">
          <EmptyState
            icon={<ScrollText className="size-5" />}
            title="No model activity yet"
            description="As soon as Revora plans pages, writes wording or makes pictures, every model answer appears here."
          />
        </div>
      ) : (
        <>
          {log.data?.byModel.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {log.data.byModel.slice(0, 6).map((model) => (
                <Pill key={`${model.provider}-${model.model}`} tone={model.failures ? "attention" : "neutral"}>
                  {model.model} · {model.entries}
                </Pill>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <Button
                key={option.key}
                size="sm"
                variant={filter === option.key ? "signal" : "outline"}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {entries.length === 0 ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">
              Nothing of that kind in the last two weeks.
            </p>
          ) : (
            <ul className="mt-3" data-testid="model-log-entries">
              {entries.map((entry) => (
                <Row key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
