import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Instagram, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { cancelInstagramDraftFn, disconnectInstagramFn, getInstagramStatusFn, publishInstagramDraftFn, saveInstagramDraftFn, startInstagramConnectFn } from "@/lib/instagram.functions";
import type { InstagramPostRow } from "@/lib/instagram.server";

export function InstagramPanel() {
  const qc = useQueryClient();
  const status = useServerFn(getInstagramStatusFn), connect = useServerFn(startInstagramConnectFn);
  const save = useServerFn(saveInstagramDraftFn), publish = useServerFn(publishInstagramDraftFn);
  const disconnect = useServerFn(disconnectInstagramFn), discard = useServerFn(cancelInstagramDraftFn);
  const account = useQuery({ queryKey: ["jarvis", "instagram"], queryFn: () => status() });
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<InstagramPostRow | null>(null);
  const [rights, setRights] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["jarvis", "instagram"] });
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try { await operation(); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Instagram request failed."); await refresh(); }
    finally { setBusy(false); }
  };
  return (
    <details className="rounded-lg border border-border bg-card" open>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium"><Instagram className="size-4" aria-hidden />Instagram <span className="ml-auto text-xs text-muted-foreground">{account.data?.connected ? `@${account.data.account?.username}` : "Not connected"}</span></summary>
      <div className="space-y-3 border-t border-border p-3">
        {account.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading Instagram…</p> : null}
        {account.error ? <p role="alert" className="text-sm text-destructive">{account.error.message}</p> : null}
        {account.data && !account.data.configured ? <p role="status" className="text-sm text-muted-foreground">Instagram app credentials are required before account sign-in.</p> : null}
        {account.data?.reconnectRequired ? <p role="alert" className="text-sm text-destructive">Your Instagram authorization expired. Reconnect before posting.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy || !account.data?.configured} onClick={() => {
            const popup = window.open("about:blank", "revora-instagram", "width=600,height=720");
            if (!popup) { toast.error("Allow popups to connect Instagram."); return; }
            void run(async () => { try { const result = await connect(); popup.location.href = result.authorizationUrl; } catch (error) { popup.close(); throw error; } });
          }}>{account.data?.account ? "Reconnect Instagram" : "Connect Instagram"}</Button>
          {account.data?.account ? <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={busy}>Disconnect</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Disconnect Instagram from Jarvis?</AlertDialogTitle><AlertDialogDescription>Pending posts will not be sent.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => { void run(async () => { await disconnect(); toast.success("Instagram disconnected."); }); }}>Disconnect Instagram</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog> : null}
          <Button variant="ghost" size="icon" aria-label="Refresh Instagram" disabled={busy || account.isFetching} onClick={() => { void refresh(); }}><RefreshCw className="size-4" /></Button>
        </div>
        <Input aria-label="Instagram image URL" placeholder="Public HTTPS image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <Textarea aria-label="Instagram caption" placeholder="Caption" rows={4} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} />
        <Button size="sm" disabled={busy || !account.data?.connected || !caption.trim() || !imageUrl.trim()} onClick={() => { void run(async () => { const post = await save({ data: { caption, imageUrl } }); setCaption(""); setImageUrl(""); setRights(false); setReview(post); }); }}>Save and review draft</Button>
        <div className="space-y-2">
          {account.data?.posts.map((post) => <article key={post.id} className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium">@{post.username} · {post.status}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{post.caption}</p>
            {post.error ? <p role="alert" className="mt-2 break-words text-xs text-destructive">{post.error}</p> : null}
            {post.status === "publishing" || post.status === "uncertain" ? <p className="mt-2 text-xs text-muted-foreground">Check Instagram before preparing this post again. Automatic retries are disabled.</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {post.status === "draft" ? <><Button size="sm" variant="outline" disabled={busy} onClick={() => { setRights(false); setReview(post); }}>Review post</Button><Button size="icon" variant="ghost" aria-label="Discard Instagram draft" disabled={busy} onClick={() => { void run(() => discard({ data: { postId: post.id } })); }}><Trash2 className="size-4" /></Button></> : null}
              {post.permalink ? <a className="text-sm underline" href={post.permalink} target="_blank" rel="noreferrer">View on Instagram</a> : null}
            </div>
          </article>)}
        </div>
      </div>
      <Dialog open={Boolean(review)} onOpenChange={(open) => { if (!open && !busy) { setReview(null); setRights(false); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Review Instagram post</DialogTitle><DialogDescription>Publishing sends this image and caption to @{review?.username} immediately.</DialogDescription></DialogHeader>
          {review ? <>
            <img src={review.image_url} alt="Image selected for this Instagram post" referrerPolicy="no-referrer" className="max-h-80 w-full object-contain" />
            <a href={review.image_url} target="_blank" rel="noreferrer" className="break-all text-xs underline">Open original image</a>
            <p className="whitespace-pre-wrap break-words text-sm">{review.caption}</p>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={rights} onCheckedChange={(v) => setRights(v === true)} disabled={busy} />I own or have permission to use this image and approve this exact post.</label>
            <Button disabled={busy || !rights || review.status !== "draft" || !account.data?.connected} onClick={() => { void run(async () => {
              await publish({ data: { postId: review.id, contentHash: review.content_hash, approved: true, rightsConfirmed: true } });
              setReview(null); setRights(false); toast.success("Instagram accepted your post.");
            }); }}><Send className="mr-2 size-4" aria-hidden />{busy ? "Submitting…" : "Approve and publish now"}</Button>
          </> : null}
        </DialogContent>
      </Dialog>
    </details>
  );
}