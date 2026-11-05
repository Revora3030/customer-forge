import { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import { Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { dateShort } from "@/lib/format";
import {
  diffContent,
  readVersionContent,
  snapshotContent,
  type ContentDiffRow,
} from "@/lib/website-content";
import { useWebsiteContent } from "@/lib/website-content.hooks";
import { useWebsiteVersions } from "@/lib/site-engine.hooks";

/**
 * Section-by-section comparison between a saved version and the working draft
 * (or between two saved versions), so a client can see exactly what changed.
 */
export function VersionDiff({ organizationId }: { organizationId: string | undefined }) {
  const { data: versions } = useWebsiteVersions(organizationId);
  const { data: pages } = useWebsiteContent(organizationId);
  const list = useMemo(() => versions ?? [], [versions]);
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("draft");

  const draft = useMemo(() => (pages ? snapshotContent(pages) : null), [pages]);
  const left = useMemo(() => {
    const chosen = list.find((version) => version.id === (leftId || list[0]?.id));
    return chosen ? readVersionContent(chosen.pages) : null;
  }, [list, leftId]);
  const right = useMemo(() => {
    if (rightId === "draft") return draft;
    const chosen = list.find((version) => version.id === rightId);
    return chosen ? readVersionContent(chosen.pages) : null;
  }, [list, rightId, draft]);

  const rows: ContentDiffRow[] = useMemo(() => diffContent(left, right), [left, right]);
  const hasSnapshots = list.some((version) => readVersionContent(version.pages));

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Compare" title="What changed between versions" />

      {!list.length ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          Save a version first, then you can compare it against your current draft.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[12px] text-muted-foreground">
              Compare from
              <select
                value={leftId || (list[0]?.id ?? "")}
                onChange={(event) => setLeftId(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-[13px] text-foreground"
              >
                {list.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} · {version.label ?? dateShort(version.created_at)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-[12px] text-muted-foreground">
              Compare to
              <select
                value={rightId}
                onChange={(event) => setRightId(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-[13px] text-foreground"
              >
                <option value="draft">Current draft (unpublished)</option>
                {list.map((version) => (
                  <option key={version.id} value={version.id}>
                    Version {version.version} · {version.label ?? dateShort(version.created_at)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!hasSnapshots ? (
            <p className="mt-4 text-[13px] text-muted-foreground">
              Versions saved before section tracking was added don't hold a structure snapshot. Save
              a new version to start comparing section by section.
            </p>
          ) : !rows.length ? (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground">
              <GitCompare className="size-4" /> No section differences between these two.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {rows.map((row, index) => (
                <li
                  key={`${row.page}-${row.section}-${row.field}-${index}`}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill
                      tone={
                        row.change === "added"
                          ? "signal"
                          : row.change === "removed"
                            ? "danger"
                            : "info"
                      }
                    >
                      {row.change}
                    </Pill>
                    <span className="text-[12px] text-muted-foreground">
                      {row.page} · {row.section} · {row.field}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-elevated p-2">
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        Before
                      </p>
                      <p className="mt-1 text-[13px] whitespace-pre-line">{row.before || "—"}</p>
                    </div>
                    <div className="rounded-md bg-elevated p-2">
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        After
                      </p>
                      <p className="mt-1 text-[13px] whitespace-pre-line">{row.after || "—"}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
