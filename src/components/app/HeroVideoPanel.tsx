import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MEDIA_BUCKET, buildObjectPath } from "@/lib/media";
import { addStockHeroVideo, heroVideoState, removeHeroVideo, setOwnHeroVideo } from "@/lib/hero-video.functions";
import { heroVideoStatusLine, heroVideoSlotNote, heroUploadProblem, HERO_VIDEO_TYPES } from "@/lib/hero-video-panel";

/**
 * The home page's top-of-page video loop: shows which clip plays and its
 * licence, why the last automatic attach did or did not add one, and lets the
 * owner (or Revora support) get a stock clip for the trade, use their own
 * video, or turn it off. Every change reaches visitors on the next Publish.
 *
 * It used to live only inside BuilderCanvas, which no route renders, so the
 * live builder never showed it.
 */
export function HeroVideoPanel({ organizationId, disabled }: { organizationId: string | undefined; disabled: boolean }) {
  const readState = useServerFn(heroVideoState);
  const addStock = useServerFn(addStockHeroVideo);
  const applyOwn = useServerFn(setOwnHeroVideo);
  const turnOff = useServerFn(removeHeroVideo);
  const [state, setState] = useState<Awaited<ReturnType<typeof heroVideoState>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => {
    if (!organizationId) return;
    readState({ data: { organizationId } })
      .then(setState)
      .catch((error: unknown) => setMessage(error instanceof Error ? `Couldn't read the top video settings: ${error.message}` : "Couldn't read the top video settings."));
  }, [organizationId, readState]);
  useEffect(refresh, [refresh]);

  const act = async (work: () => Promise<{ message: string }>) => {
    setBusy(true);
    try {
      setMessage((await work()).message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That didn't work. Your top of page is unchanged.");
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const upload = (file: File) =>
    act(async () => {
      if (!organizationId) throw new Error("Pick a business first.");
      const problem = heroUploadProblem(file);
      if (problem) throw new Error(problem);
      const path = buildObjectPath(organizationId, file.name);
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(`The media library refused this video (${uploadError.message}). Your top of page is unchanged.`);
      const { data: row, error: rowError } = await supabase
        .from("media")
        .insert({ organization_id: organizationId, url: path, category: "hero_video", file_name: file.name.slice(0, 120), size_bytes: file.size, alt_text: null, source: "owner" } as never)
        .select("id")
        .single();
      if (rowError || !row) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        throw new Error("Couldn't save that video to your media library. Your top of page is unchanged.");
      }
      return applyOwn({ data: { organizationId, path, mediaId: (row as { id: string }).id } });
    });

  const on = state?.state === "on";
  const status = state ? heroVideoStatusLine(state.lastAttempt) : null;
  const slotNote = state ? heroVideoSlotNote(state.slot) : null;
  return (
    <div className="space-y-2 rounded-xl border border-border p-3" data-hero-video-panel="">
      <p className="text-[12px] font-medium">Home page top video {on ? "· on" : state?.state === "off" ? "· off" : ""}</p>
      {on && state?.credit ? (
        <p className="text-[12px] text-muted-foreground">
          {state.credit}
          {state.license ? ` · ${state.license}` : ""}. Stock footage is licensed for your site only.
        </p>
      ) : on && state?.source === "owner" ? (
        <p className="text-[12px] text-muted-foreground">Your own video is playing.</p>
      ) : (
        <p className="text-[12px] text-muted-foreground">A short muted loop that plays behind your headline.</p>
      )}
      {status ? <p className="text-[12px] text-muted-foreground" role="status">{status}</p> : null}
      {slotNote ? <p className="text-[12px] text-amber-700 dark:text-amber-300">{slotNote}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy || !organizationId} onClick={() => organizationId && act(() => addStock({ data: { organizationId, replace: on } }))}>
          {on ? "Try another stock clip" : "Add stock video"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy || !organizationId} onClick={() => fileRef.current?.click()}>
          Use my own video
        </Button>
        {on ? (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy || !organizationId} onClick={() => organizationId && act(() => turnOff({ data: { organizationId } }))}>
            Turn off
          </Button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={HERO_VIDEO_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {message ? <p className="text-[12px] text-muted-foreground">{message}</p> : null}
      <p className="text-[11px] text-muted-foreground">Changes reach visitors the next time you publish.</p>
    </div>
  );
}
