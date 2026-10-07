/**
 * "History" chip on a picked section: lists the saved versions where this one
 * section looked different, and puts just that section back. Everything else
 * on the site stays as it is; a restore point is saved first.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listSectionHistory, restoreSectionVersion } from "@/lib/site-restore.functions";
import { announceDraftChange } from "@/lib/builder/preview-bridge";
import { dateShort } from "@/lib/format";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function SectionHistoryButton({ organizationId, sectionId }: { organizationId: string | null; sectionId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const list = useServerFn(listSectionHistory);
  const restore = useServerFn(restoreSectionVersion);
  const valid = Boolean(organizationId) && UUID.test(sectionId);
  const history = useQuery({
    queryKey: ["section-history", organizationId, sectionId],
    enabled: open && valid,
    queryFn: () => list({ data: { organizationId: organizationId!, sectionId } }),
  });
  const put = useMutation({
    mutationFn: (versionId: string) => restore({ data: { organizationId: organizationId!, sectionId, versionId } }),
    onSuccess: (result) => {
      setOpen(false);
      toast.success(`This section is back to version ${result.restoredFrom}. The rest of your site is unchanged.`);
      for (const key of ["website_content", "website_versions"]) void queryClient.invalidateQueries({ queryKey: [key, organizationId] });
      if (organizationId) announceDraftChange(organizationId);
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't restore that section.")),
  });
  if (!valid) return null;
  const entries = history.data?.entries ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="section-history"
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border/70 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <History className="size-3.5" aria-hidden />
          History
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-2 pt-1 pb-2 text-[12px] text-muted-foreground">Put just this section back. Nothing else changes.</p>
        {history.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading…
          </div>
        ) : entries.length <= 1 ? (
          <p className="px-2 py-3 text-[12px] text-muted-foreground">No earlier versions of this section yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {entries.slice(1).map((entry) => (
              <li key={entry.versionId}>
                <button
                  type="button"
                  disabled={put.isPending}
                  onClick={() => put.mutate(entry.versionId)}
                  className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-muted disabled:opacity-50"
                >
                  <span className="block font-medium">
                    Version {entry.version} · {dateShort(entry.createdAt)}
                  </span>
                  <span className="block truncate text-muted-foreground">{entry.heading ?? entry.label ?? "Untitled section"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
