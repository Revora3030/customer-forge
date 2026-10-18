import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Code2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JarvisMarkdown } from "@/components/app/JarvisMarkdown";
import { listClaudeCodeRequestsFn, sendClaudeCodeRequestFn } from "@/lib/jarvis.functions";

/**
 * Jarvis panel: hand a coding change to Claude Code. Claude works on its own
 * branch in GitHub and opens a pull request; nothing goes live until you merge
 * it and Lovable syncs the change.
 */
export function ClaudeCodePanel() {
  const qc = useQueryClient();
  const send = useServerFn(sendClaudeCodeRequestFn);
  const list = useServerFn(listClaudeCodeRequestsFn);
  const [request, setRequest] = useState("");

  const requests = useQuery({
    queryKey: ["jarvis", "claude-code"],
    queryFn: () => list(),
    refetchInterval: 30_000,
    retry: false,
  });

  const sending = useMutation({
    mutationFn: () => send({ data: { request } }),
    onSuccess: () => {
      toast.success("Sent to Claude Code. It posts progress and the pull request on the GitHub issue.");
      setRequest("");
      void qc.invalidateQueries({ queryKey: ["jarvis", "claude-code"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't reach GitHub. Try again."),
  });

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <Code2 className="size-4" aria-hidden />
        Claude Code · change the platform's code
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <p className="text-xs text-muted-foreground">
          Describe a change to Revora itself, like a new page, a fix or a feature. Claude Code reads the whole codebase,
          makes the change on its own branch, runs the checks and opens a pull request. Nothing goes live until you
          merge it in GitHub; then Lovable syncs it and you press Publish.
        </p>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!sending.isPending) sending.mutate();
          }}
        >
          <Textarea
            className="min-h-24 text-[13px]"
            aria-label="Coding request for Claude Code"
            placeholder="Add a FAQ section to /pricing answering the five questions contractors ask most, with FAQPage schema."
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={sending.isPending || request.trim().length < 10}>
            {sending.isPending ? "Sending…" : "Send to Claude Code"}
          </Button>
        </form>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent requests</h3>
          <Button type="button" size="sm" variant="ghost" onClick={() => void requests.refetch()} aria-label="Refresh requests">
            <RefreshCw className={`size-4 ${requests.isFetching ? "animate-spin" : ""}`} aria-hidden />
          </Button>
        </div>
        {requests.error ? (
          <p className="text-xs text-muted-foreground">
            {requests.error instanceof Error ? requests.error.message : "Couldn't load requests from GitHub."}
          </p>
        ) : requests.data?.length ? (
          <div className="space-y-2">
            {requests.data.map((item) => (
              <article key={item.number} className="rounded-lg border border-border p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-[13px] font-medium">
                    #{item.number} {item.title}
                  </p>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {item.state === "open" ? "Open" : "Closed"} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>
                {item.latest ? (
                  <div className="mt-1.5 max-h-48 overflow-y-auto text-[12px]">
                    <JarvisMarkdown>{item.latest}</JarvisMarkdown>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Waiting for Claude Code to start…</p>
                )}
              </article>
            ))}
          </div>
        ) : requests.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <p className="text-xs text-muted-foreground">No requests yet.</p>
        )}
      </div>
    </details>
  );
}
