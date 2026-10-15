/** Jarvis's live waveform: moving bars while speaking, a pulse while listening or thinking. */
export function VoiceWave({ state, level }: { state: "idle" | "listening" | "thinking" | "speaking"; level: number }) {
  const weights = [0.45, 0.75, 1, 0.75, 0.45];
  const label = state === "speaking" ? "Jarvis is speaking" : state === "listening" ? "Jarvis is listening" : state === "thinking" ? "Jarvis is thinking" : "Jarvis is idle";
  return (
    <span role="img" aria-label={label} className="flex h-9 w-9 shrink-0 items-center justify-center gap-[3px] rounded-full bg-primary/15">
      {weights.map((weight, index) => {
        const height =
          state === "speaking"
            ? 6 + Math.round(Math.max(0.12, level) * weight * 18)
            : state === "idle"
              ? 4
              : 8;
        return (
          <span
            key={index}
            className={`w-[3px] rounded-full bg-primary transition-[height] duration-75 ${state === "listening" || state === "thinking" ? "animate-pulse" : ""}`}
            style={{ height, animationDelay: `${index * 120}ms` }}
          />
        );
      })}
    </span>
  );
}
