import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { Inbox, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approveReplyDraftFn, dismissInboundFn, listProspectInboxFn, saveGmailConnectionFn, testGmailConnectionFn } from "@/lib/prospect-replies.functions";

const KEY = ["jarvis", "prospect-inbox"] as const;

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const ACTION_LABEL: Record<string, string> = {
  auto_replied: "Auto-replied",
  drafted: "Draft waiting for you",
  do_not_contact: "Added to do-not-contact",
  draft_sent: "Your reply was sent",
  dismissed: "Dismissed",
  ignored_auto_reply: "Automatic reply (ignored)",
};

/**
 * Operations panel: replies prospects sent to demo emails. Stop replies are
 * already on do-not-contact; anything the system wouldn't answer on its own
 * waits here as an editable draft.
 */
export function ProspectInboxCard({ className }: { className?: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProspectInboxFn);
  const approveFn = useServerFn(approveReplyDraftFn);
  const dismissFn = useServerFn(dismissInboundFn);
  const saveGmailFn = useServerFn(saveGmailConnectionFn);
  const testGmailFn = useServerFn(testGmailConnectionFn);
  const inbox = useQuery({ queryKey: KEY, queryFn: () => listFn(), refetchInterval: 60_000 });
  const [edits, setEdits] = useState<Record<string, string>>({});

  const approve = useMutation({
    mutationFn: (input: { inboundId: string; body: string }) => approveFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) toast.success("Reply sent in their email thread.");
      else toast.error(result.message);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't send the reply."),
  });
  const dismiss = useMutation({
    mutationFn: (inboundId: string) => dismissFn({ data: { inboundId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });

  const data = inbox.data;
  const waiting = (data?.items ?? []).filter((item) => item.status === "awaiting_operator");
  const [gmailForm, setGmailForm] = useState({ clientId: "", clientSecret: "", refreshToken: "", senderEmail: "", mailingAddress: "" });
  const saveGmail = useMutation({
    mutationFn: () => saveGmailFn({ data: gmailForm }),
    onSuccess: (result) => {
      toast.success(result.configured ? "Gmail connection saved." : "Saved. A few fields are still missing.");
      setGmailForm({ clientId: "", clientSecret: "", refreshToken: "", senderEmail: "", mailingAddress: "" });
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't save Gmail."),
  });
  const testGmail = useMutation({
    mutationFn: () => testGmailFn({ data: gmailForm }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Gmail connected as ${result.email}. No message was sent.`);
      else toast.error(result.message);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Gmail test failed."),
  });
  const setField = (key: keyof typeof gmailForm) => (event: ChangeEvent<HTMLInputElement>) => setGmailForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <details className={`rounded-xl border border-border bg-card ${className ?? ""}`}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium">
        <Inbox className="h-4 w-4" aria-hidden />
        Prospect replies
        {waiting.length ? <span className="ml-auto rounded-full bg-primary px-2 text-xs text-primary-foreground">{waiting.length} waiting</span> : null}
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        {inbox.isLoading ? <p className="text-muted-foreground">Loading replies…</p> : null}
        {inbox.isError ? <p className="text-destructive">Couldn't load replies.</p> : null}
        {data ? (
          <form className="space-y-2 rounded-md border border-border p-3" onSubmit={(event) => { event.preventDefault(); saveGmail.mutate(); }}>
            <p className="font-medium">Connect Gmail</p>
            <p className="text-xs text-muted-foreground">
              {data.configured
                ? `Connected${data.gmail?.senderEmail ? ` as ${data.gmail.senderEmail}` : ""}${data.gmail?.mailingAddressSet ? "" : ". Add the mailing address before mail can send"}. Paste a field only to replace it.`
                : "Gmail isn't connected, so replies aren't read yet. Paste the OAuth client, refresh token, sender and mailing address here. Saved values stay on the server; blank fields keep what is already saved."}
            </p>
            {!data.configured && data.missingSecrets.length ? <p className="text-xs text-muted-foreground">Still needed: {data.missingSecrets.join(", ")}{data.gmail?.mailingAddressSet ? "" : ", REVORA_MAILING_ADDRESS"}.</p> : null}
            <label className="block text-xs">Client id<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" autoComplete="off" value={gmailForm.clientId} onChange={setField("clientId")} /></label>
            <label className="block text-xs">Client secret<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" type="password" autoComplete="off" value={gmailForm.clientSecret} onChange={setField("clientSecret")} /></label>
            <label className="block text-xs">Refresh token<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" type="password" autoComplete="off" value={gmailForm.refreshToken} onChange={setField("refreshToken")} /></label>
            <label className="block text-xs">Sender email<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" type="email" autoComplete="off" placeholder={data.gmail?.senderEmail ?? ""} value={gmailForm.senderEmail} onChange={setField("senderEmail")} /></label>
            <label className="block text-xs">Mailing address<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" autoComplete="off" value={gmailForm.mailingAddress} onChange={setField("mailingAddress")} /></label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saveGmail.isPending}>Save Gmail connection</Button>
              <Button type="button" size="sm" variant="outline" disabled={testGmail.isPending} onClick={() => testGmail.mutate()}>Test Gmail connection</Button>
            </div>
          </form>
        ) : null}
        {data?.lastPolledAt ? <p className="text-xs text-muted-foreground">Last checked {when(data.lastPolledAt)}{data.lastError ? ` · ${data.lastError}` : ""}</p> : null}
        {data && !data.items.length ? <p className="text-muted-foreground">No replies yet.</p> : null}
        <ul className="space-y-3">
          {(data?.items ?? []).map((item) => {
            const draft = edits[item.id] ?? item.draftText ?? "";
            const open = item.status === "awaiting_operator";
            return (
              <li key={item.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{item.businessName || item.from}</span>
                  <span className="text-xs text-muted-foreground">{item.from} · {when(item.receivedAt)}</span>
                  <span className="ml-auto text-xs uppercase tracking-wide text-muted-foreground">{item.intent}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{(item.body ?? item.snippet ?? "").slice(0, 600)}</p>
                <p className="text-xs">
                  {ACTION_LABEL[item.action ?? ""] ?? (item.status === "pending" ? "Waiting for the next check" : item.status)}
                  {item.draftReason ? ` · ${item.draftReason}` : ""}
                </p>
                {open ? (
                  <div className="space-y-2">
                    <Textarea
                      aria-label={`Reply to ${item.businessName || item.from}`}
                      value={draft}
                      onChange={(event) => setEdits((current) => ({ ...current, [item.id]: event.target.value }))}
                      rows={5}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={approve.isPending || draft.trim().length < 2 || !data?.configured}
                        onClick={() => approve.mutate({ inboundId: item.id, body: draft })}
                      >
                        <Send className="mr-1 h-4 w-4" aria-hidden />
                        Send reply
                      </Button>
                      <Button size="sm" variant="outline" disabled={dismiss.isPending} onClick={() => dismiss.mutate(item.id)}>
                        <X className="mr-1 h-4 w-4" aria-hidden />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
