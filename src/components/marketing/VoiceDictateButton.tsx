import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { appendTranscript, getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/speech-input";

/**
 * Optional "say it instead" mic for a text field. Free browser dictation only.
 * Renders nothing when the browser doesn't support it, so the text box stays the only path.
 * Starts only on a click; the transcript is appended to the field so the owner can edit it.
 */
export function VoiceDictateButton({
  value,
  onText,
  label,
}: {
  value: string;
  onText: (next: string) => void;
  label: string;
}) {
  const hintId = useId();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => recRef.current?.stop();
  }, []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setProblem(null);
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let spoken = "";
      for (let i = 0; i < event.results.length; i += 1) spoken += ` ${event.results[i]?.[0]?.transcript ?? ""}`;
      onText(appendTranscript(valueRef.current, spoken));
    };
    rec.onerror = (event) => {
      setProblem(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone is blocked. Type your answer instead."
          : "Couldn't hear that. Try again or type your answer.",
      );
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        aria-describedby={hintId}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {listening ? <Square className="size-3" aria-hidden="true" /> : <Mic className="size-3" aria-hidden="true" />}
        {listening ? "Listening… tap to stop" : "Say it"}
      </button>
      <span id={hintId} className="sr-only">
        {listening ? `Stops dictating ${label}` : `Dictates ${label}`}
      </span>
      <span className="text-[11px] text-muted-foreground">
        Your browser may send your voice to its speech service to turn it into text.
      </span>
      {problem ? (
        <span role="status" className="text-[11px] text-destructive">
          {problem}
        </span>
      ) : null}
    </span>
  );
}
