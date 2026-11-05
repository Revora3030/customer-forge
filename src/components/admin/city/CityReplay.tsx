import { useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CitySnapshot, CityWork } from "@/lib/ai-city";
import { MARKER_LABEL, REPLAY_SLOTS, REPLAY_SPEEDS, nextSlot, replayFrame, replayMarkers, replayTruncationNote, type ReplayFrame, type ReplaySpeed } from "@/lib/city-replay";

const TONE = { failure: "bg-destructive", approval: "bg-gold", publish: "bg-success", ci: "bg-cyan-400" } as const;
const timeLabel = (at: number) => new Date(at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

/**
 * JC-7 timeline replay + JC-8 event markers, from already-fetched rows only.
 * `onReplayFrame` exposes the replayed time with its load and health so the
 * scene (sky/weather) can follow the scrubber instead of a hard-coded "now".
 */
export function CityReplay({ snapshot, now, onOpen, onReplayFrame }: { snapshot: CitySnapshot | undefined; now: number; onOpen: (row: CityWork) => void; onReplayFrame?: (frame: ReplayFrame) => void }) {
  const last = REPLAY_SLOTS - 1;
  const [slot, setSlot] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const frame = useMemo(() => replayFrame(snapshot, slot, now), [snapshot, slot, now]);
  const markers = useMemo(() => replayMarkers(snapshot, now), [snapshot, now]);
  const note = useMemo(() => replayTruncationNote(snapshot, now), [snapshot, now]);
  useEffect(() => { onReplayFrame?.(frame); }, [frame, onReplayFrame]);
  useEffect(() => {
    if (!playing) return;
    if (slot >= last) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setSlot((s) => nextSlot(s, speed)), 500);
    return () => clearTimeout(timer);
  }, [playing, slot, speed, last]);
  if (!snapshot || !now) return null;
  const toggle = () => { if (!playing && slot >= last) setSlot(0); setPlaying(!playing); };
  return (
    <section aria-label="Timeline replay" className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Replay last 48h</h2>
        <Button type="button" size="sm" variant="outline" className="min-h-11 min-w-11" aria-label={playing ? "Pause replay" : "Play replay"} aria-pressed={playing} onClick={toggle}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</Button>
        <div role="group" aria-label="Replay speed" className="flex gap-1">{REPLAY_SPEEDS.map((s) => <Button key={s} type="button" size="sm" variant={speed === s ? "secondary" : "ghost"} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</Button>)}</div>
        <Button type="button" size="sm" variant="ghost" disabled={slot === last} onClick={() => { setPlaying(false); setSlot(last); }}>Now</Button>
      </div>
      <div className="relative mt-3">
        <input type="range" min={0} max={last} step={1} value={slot} aria-label="Replay time" aria-valuetext={frame.isNow ? "Now" : timeLabel(frame.at)} onChange={(e) => { setPlaying(false); setSlot(Number(e.target.value)); }} className="w-full min-h-11" />
        <ul aria-label="Replay events" className="relative h-6">
          {markers.map((m) => <li key={m.row.id} className="absolute top-0" style={{ left: `calc(${(m.slot / last) * 100}% - 6px)` }}>
            <button type="button" className="flex size-6 items-center justify-center" aria-label={`${MARKER_LABEL[m.kind]}: ${m.row.title}, ${timeLabel(Date.parse(m.row.at))}`} title={`${MARKER_LABEL[m.kind]}: ${m.row.title}`} onClick={() => { setPlaying(false); setSlot(m.slot); onOpen(m.row); }}><span className={`block h-4 w-1 rounded ${TONE[m.kind]}`} /></button>
          </li>)}
        </ul>
      </div>
      <p role="status" className="mt-1 text-xs text-muted-foreground">{frame.isNow ? "Now" : timeLabel(frame.at)} · {frame.load} record{frame.load === 1 ? "" : "s"} in this 15-minute slot{frame.health === null ? "" : ` · ${Math.round(frame.health * 100)}% not failed`}</p>
      {note ? <p className="mt-1 text-xs text-gold">{note}</p> : null}
    </section>
  );
}
