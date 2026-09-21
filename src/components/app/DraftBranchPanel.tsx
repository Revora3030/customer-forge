import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { Check, GitBranch, Trash2 } from "lucide-react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dateShort } from "@/lib/format";
import { friendlyError } from "@/lib/user-error";
import {
  discardSiteBranch,
  keepSiteBranch,
  listSiteBranches,
  startSiteBranch,
} from "@/lib/site-branch.functions";
import { describeBranchChange, type BranchChange, type DraftBranch } from "@/lib/builder/draft-branch";

type BranchList = {
  branches: DraftBranch[];
  open: DraftBranch | null;
  liveChange: BranchChange | null;
  liveSummary: string | null;
};

/**
 * Draft branches: try changes on a separate copy of the website, then keep them
 * or throw them away. Throwing away puts the website back exactly as it was,
 * and publishing is held until the draft is closed.
 */
export function DraftBranchPanel({
  organizationId,
  canManage,
}: {
  organizationId: string | null;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listSiteBranches);
  const start = useServerFn(startSiteBranch);
  const keep = useServerFn(keepSiteBranch);
  const discard = useServerFn(discardSiteBranch);
  const [label, setLabel] = useState("");

  const branches = useQuery({
    queryKey: ["site-branches", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () =>
      (await list({ data: { organizationId: organizationId! } })) as BranchList,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["site-branches", organizationId] });
    void queryClient.invalidateQueries({ queryKey: ["website_pages"] });
    void queryClient.invalidateQueries({ queryKey: ["website_content"] });
    void queryClient.invalidateQueries({ queryKey: ["website_settings"] });
  };

  const startDraft = useMutation({
    mutationFn: async () => start({ data: { organizationId: organizationId!, label } }),
    onSuccess: () => {
      setLabel("");
      toast.success("Draft started. Changes stay in this draft until you keep them.");
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't start a draft.")),
  });

  const keepDraft = useMutation({
    mutationFn: async (branchId: string) =>
      (await keep({ data: { organizationId: organizationId!, branchId } })) as { summary: string },
    onSuccess: (result) => {
      toast.success(result.summary);
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't keep this draft.")),
  });

  const discardDraft = useMutation({
    mutationFn: async (branchId: string) =>
      (await discard({ data: { organizationId: organizationId!, branchId } })) as {
        exact: boolean;
        summary: string;
      },
    onSuccess: (result) => {
      if (result.exact) toast.success(result.summary);
      else toast.warning(result.summary);
      refresh();
    },
    onError: (error: Error) =>
      toast.error(friendlyError(error, "Couldn't throw this draft away.")),
  });

  const data = branches.data;
  const open = data?.open ?? null;
  const closed = (data?.branches ?? []).filter((branch) => branch.status !== "open");
  const busy = startDraft.isPending || keepDraft.isPending || discardDraft.isPending;

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Revora"
        title="Drafts"
        description="Try changes on a separate copy, then keep them or throw them away."
      />

      {branches.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking your drafts…</p>
      ) : open ? (
        <div className="mt-4 rounded-lg border border-border/70 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <GitBranch className="h-4 w-4" />
            {open.label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Started {dateShort(open.createdAt)}.{" "}
            {data?.liveSummary ?? "Nothing has changed in this draft yet."}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Your website stays as it is for visitors: publishing is held until this draft is closed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!canManage || busy}
              onClick={() => keepDraft.mutate(open.id)}
            >
              <Check className="mr-2 h-4 w-4" />
              {keepDraft.isPending ? "Keeping…" : "Keep these changes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || busy}
              onClick={() => discardDraft.mutate(open.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {discardDraft.isPending ? "Putting back…" : "Throw this draft away"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name this draft, e.g. New homepage"
            className="max-w-xs"
            disabled={!canManage || busy}
          />
          <Button
            size="sm"
            disabled={!canManage || !organizationId || busy}
            onClick={() => startDraft.mutate()}
          >
            <GitBranch className="mr-2 h-4 w-4" />
            {startDraft.isPending ? "Starting…" : "Start a draft"}
          </Button>
        </div>
      )}

      {closed.length ? (
        <ul className="mt-5 space-y-2">
          {closed.map((branch) => (
            <li key={branch.id} className="rounded-lg border border-border/60 p-3 text-sm">
              <span className="font-medium">{branch.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {branch.status === "kept" ? "Kept" : "Thrown away"}
                {branch.closedAt ? ` ${dateShort(branch.closedAt)}` : ""}
              </span>
              {branch.status === "kept" && branch.summary ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {describeBranchChange(branch.summary)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!canManage ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Ask a workspace owner, admin or manager to work with drafts.
        </p>
      ) : null}
    </Panel>
  );
}
