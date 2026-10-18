import { Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceWave } from "@/components/app/VoiceWave";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

type Props = {
  state: VoiceState;
  level: number;
  label: string;
  busy: boolean;
  onTapToTalk: () => void;
  onEnd: () => void;
};

/** The hands-free Live panel above the composer: one large control to talk or interrupt. */
export function LiveSurface({ state, level, label, busy, onTapToTalk, onEnd }: Props) {
  const listening = state === "listening";
  return (
    <section aria-label="Live voice" className="mb-2 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-3">
      <span className="shrink-0 [&>span]:size-10"><VoiceWave state={state} level={level} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 truncate text-sm font-medium sm:w-28" aria-live="polite">{label}</p>
        <Button type="button" data-jarvis-tap="" className="h-12 flex-1 rounded-xl text-[15px]" disabled={listening || busy} onClick={onTapToTalk}>
          <Mic className="size-5" aria-hidden />
          {listening ? "Listening…" : busy ? "Thinking…" : "Tap to talk"}
        </Button>
      </div>
      <Button type="button" variant="ghost" data-jarvis-tap="" className="h-12 shrink-0 px-3" onClick={onEnd}>
        <X className="size-4" aria-hidden />End Live
      </Button>
    </section>
  );
}
