import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { draftDemoOutreach, sendDemoOutreachFn } from "@/lib/jarvis-demo-site.functions";
import { channelLabel, lastSent, sendFailureHelp, smsDraft, validRecipient, type DemoBuildStatus, type DemoCardRef, type DemoChannel, type DemoOutreachEntry } from "./demo-build";

export type SendError = { message: string; help: string | null };

type FormProps = {
  channel: DemoChannel;
  recipient: string;
  onRecipientChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  onBodyChange: (value: string) => void;
  /** True while the Lovable AI team writes the email. */
  drafting: boolean;
  /** Who wrote the draft, or why there is none. */
  draftNote: string | null;
  /** Why sending is not possible at all (e.g. no mailing address); disables Send. */
  blocker: string | null;
  previouslySent: DemoOutreachEntry | null;
  resend: boolean;
  onResendChange: (value: boolean) => void;
  sending: boolean;
  error: SendError | null;
  onSubmit: () => void;
  onCancel: () => void;
};

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "earlier" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

/**
 * The confirm step before Jarvis sends one demo email or text. Everything is
 * visible and editable first; nothing goes out until the owner taps Send.
 */
export function DemoSendForm(props: FormProps) {
  const { channel, recipient, subject, body, drafting, draftNote, blocker, previouslySent, resend, sending, error } = props;
  const email = channel === "email";
  const recipientOk = validRecipient(channel, recipient);
  const canSend = recipientOk && body.trim().length > 0 && (!email || subject.trim().length > 0) && !blocker && !drafting && !sending && (!previouslySent || resend);
  return (
    <form
      className="space-y-3"
      aria-busy={drafting || sending}
      onSubmit={(event) => { event.preventDefault(); if (canSend) props.onSubmit(); }}
    >
      <div className="space-y-1">
        <Label htmlFor="demo-send-to">{email ? "Email address" : "Mobile number"}</Label>
        <Input
          id="demo-send-to"
          type={email ? "email" : "tel"}
          inputMode={email ? "email" : "tel"}
          autoComplete="off"
          value={recipient}
          placeholder={email ? "owner@example.com" : "(919) 555-0142"}
          aria-invalid={recipient.length > 0 && !recipientOk}
          aria-describedby="demo-send-to-hint"
          className="h-11 text-base sm:text-sm"
          onChange={(event) => props.onRecipientChange(event.target.value)}
        />
        <p id="demo-send-to-hint" className="text-xs text-muted-foreground">
          {recipient.length > 0 && !recipientOk
            ? email ? "Enter a full email address." : "Enter a 10-digit number."
            : "Prefilled from the business's public details. Check it before sending."}
        </p>
      </div>
      {drafting ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Jarvis is writing the email…</p>
      ) : (
        <>
          {email ? (
            <div className="space-y-1">
              <Label htmlFor="demo-send-subject">Subject</Label>
              <Input id="demo-send-subject" value={subject} maxLength={120} className="h-11 text-base sm:text-sm" onChange={(event) => props.onSubjectChange(event.target.value)} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="demo-send-body">{email ? "Email" : "Text message"}</Label>
            <Textarea id="demo-send-body" rows={email ? 9 : 4} value={body} aria-describedby="demo-send-body-hint" onChange={(event) => props.onBodyChange(event.target.value)} />
            <p id="demo-send-body-hint" className="text-xs text-muted-foreground">
              {email
                ? "Your sender name, mailing address and a one-click unsubscribe link are part of every email."
                : `${body.length} characters. Jarvis adds “Reply STOP to opt out.” at the end.`}
              {draftNote ? ` ${draftNote}` : ""}
            </p>
          </div>
        </>
      )}
      {previouslySent ? (
        <label className="flex min-h-11 items-start gap-2.5 rounded-md border border-border p-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" checked={resend} onChange={(event) => props.onResendChange(event.target.checked)} />
          <span>Send again. This demo was already sent to {previouslySent.recipient || "this business"} on {when(previouslySent.createdAt)}.</span>
        </label>
      ) : null}
      {blocker ? <p role="alert" className="text-sm text-destructive">{blocker}</p> : null}
      {error ? (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm">
          <p className="font-medium text-destructive">{error.message}</p>
          {error.help ? <p className="text-muted-foreground">{error.help}</p> : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Jarvis checks the do-not-contact list and today's sending limit before anything goes out.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* Closing mid-send would release the proposal while the message still goes out. */}
        <Button type="button" variant="outline" data-jarvis-tap="" className="min-h-11" disabled={sending} onClick={props.onCancel}>Cancel</Button>
        <Button type="submit" data-jarvis-tap="" className="min-h-11 gap-1.5" disabled={!canSend}>
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : email ? <Mail className="size-4" aria-hidden /> : <MessageSquare className="size-4" aria-hidden />}
          {sending ? "Sending…" : email ? "Send email" : "Send text"}
        </Button>
      </div>
    </form>
  );
}

type SheetProps = {
  /** The channel to send on; null keeps the sheet closed. */
  channel: DemoChannel | null;
  onClose: () => void;
  card: DemoCardRef;
  status: DemoBuildStatus;
  /** Full preview link to put in a text. */
  link: string | null;
  /** A recipient Jarvis proposed in chat, used instead of the one on file. */
  initialTo?: string | undefined;
  onSent: (channel: DemoChannel) => void;
};

/** Bottom sheet that drafts, shows and sends one demo email or text. */
export function DemoSendSheet({ channel, onClose, card, status, link, initialTo, onSent }: SheetProps) {
  const qc = useQueryClient();
  const draftFn = useServerFn(draftDemoOutreach);
  const sendFn = useServerFn(sendDemoOutreachFn);
  const open = channel !== null;
  const email = channel === "email";
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [resend, setResend] = useState(false);
  const [error, setError] = useState<SendError | null>(null);

  // The email is written by the Lovable AI team on the server; texts start from a short editable line.
  const draft = useQuery({
    queryKey: ["jarvis", "demo-draft", card.organizationId],
    queryFn: () => draftFn({ data: { organizationId: card.organizationId } }),
    enabled: open && email,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!channel) return;
    setRecipient(initialTo || (channel === "email" ? status.email : status.phone) || "");
    setResend(false);
    setError(null);
    setSubject("");
    setBody(channel === "sms" ? smsDraft(card.name, link ?? "") : "");
    // Only when the sheet opens or switches channel; later status polls must not overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
  useEffect(() => {
    if (channel !== "email" || !draft.data) return;
    setSubject((current) => current || draft.data.subject);
    setBody((current) => current || draft.data.body);
    if (!initialTo && !status.email && draft.data.email) setRecipient((current) => current || draft.data.email || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, draft.data]);

  const sending = useMutation({
    mutationFn: () => sendFn({
      data: {
        organizationId: card.organizationId,
        channel: channel ?? "email",
        to: recipient.trim(),
        ...(email ? { subject: subject.trim() } : {}),
        body: body.trim(),
        ...(resend ? { force: true } : {}),
      },
    }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["jarvis", "demo-status", card.organizationId] });
      if (result.ok) {
        toast.success(`${channelLabel(channel ?? "email")} sent to ${recipient.trim()}.`);
        onSent(channel ?? "email");
        onClose();
        return;
      }
      setError({ message: result.message, help: sendFailureHelp(result.reason) });
    },
    onError: (failure: Error) => setError({ message: failure.message || "Couldn't send. Nothing went out.", help: null }),
  });

  const draftNote = !email
    ? null
    : draft.error
      ? `Jarvis couldn't write the email (${draft.error.message}). Write it yourself above.`
      : draft.data
        ? draft.data.aiWritten ? "Written by the Lovable AI team. Edit anything." : "The AI was unavailable, so a plain template was used."
        : null;
  const blocker = email && draft.data && !draft.data.mailingAddressConfigured
    ? "Set REVORA_MAILING_ADDRESS (a real street address or PO box) in your server secrets before sending. Commercial email must include it."
    : status.claimed ? "This business already claimed its demo, so there's nothing to send." : null;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next && !sending.isPending) onClose(); }}>
      <SheetContent side="bottom" data-jarvis-sheet="" className="mx-auto max-h-[90dvh] w-full max-w-xl gap-3 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="space-y-0.5 pr-10 text-left sm:text-left">
          <SheetTitle>{email ? "Email" : "Text"} the demo{card.name ? ` to ${card.name}` : ""}</SheetTitle>
          <SheetDescription>Review the message. It goes out only when you tap Send.</SheetDescription>
        </SheetHeader>
        {channel ? (
          <DemoSendForm
            channel={channel}
            recipient={recipient}
            onRecipientChange={setRecipient}
            subject={subject}
            onSubjectChange={setSubject}
            body={body}
            onBodyChange={setBody}
            drafting={email && draft.isLoading}
            draftNote={draftNote}
            blocker={blocker}
            previouslySent={lastSent(status.outreach, channel)}
            resend={resend}
            onResendChange={setResend}
            sending={sending.isPending}
            error={error}
            onSubmit={() => sending.mutate()}
            onCancel={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
