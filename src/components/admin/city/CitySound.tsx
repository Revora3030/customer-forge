import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CityWork } from "@/lib/ai-city";
import { createCitySound, diffCityCues, readSoundOn, writeSoundOn } from "@/lib/city-sound";

/**
 * JC-11: opt-in sound for AI City. Muted by default; the first read after load
 * is silent; the audio system is only touched after a tap.
 */
export function CitySound({ rows }: { rows: readonly CityWork[] }) {
  const engine = useRef<ReturnType<typeof createCitySound>>(null);
  engine.current ??= createCitySound();
  const [on, setOn] = useState(false);
  const previous = useRef<readonly CityWork[] | null>(null);

  // Restore the remembered choice after mount (never during render, so server and client markup match).
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!readSoundOn(window.localStorage, reduced)) return;
    setOn(true);
    // Remembered "on" still needs a tap to unlock audio: arm on the first press.
    const unlock = () => { engine.current?.unlock(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  useEffect(() => {
    const cues = diffCityCues(previous.current, rows);
    previous.current = rows;
    const top = cues[0];
    if (on && top) engine.current?.play(top);
  }, [rows, on]);

  const toggle = () => {
    const next = !on;
    if (next) engine.current?.unlock();
    setOn(next);
    writeSoundOn(window.localStorage, next);
  };
  return <Button size="icon" variant="ghost" className="min-h-11 min-w-11" aria-pressed={on} aria-label={on ? "Turn city sounds off" : "Turn city sounds on"} title={on ? "Sounds on" : "Sounds off"} onClick={toggle}>{on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}</Button>;
}
