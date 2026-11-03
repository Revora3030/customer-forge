/**
 * Live answer text. A caller wraps an AI call in `withTextDeltas` and its sink
 * receives the accumulated answer text as the model streams it, so the owner
 * can watch the reply being written. Purely a courtesy: a sink that throws is
 * ignored, and outside a scope `emitTextDelta` does nothing. A failover to the
 * next model simply restarts the text from that model's first token.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Sink = (textSoFar: string) => void;
const sinks = new AsyncLocalStorage<Sink>();

export function withTextDeltas<T>(sink: Sink, run: () => Promise<T>): Promise<T> {
  return sinks.run(sink, run);
}

export function emitTextDelta(textSoFar: string): void {
  const sink = sinks.getStore();
  if (!sink) return;
  try {
    sink(textSoFar);
  } catch {
    /* cosmetic only */
  }
}

/**
 * Reads the value of a top-level JSON string field from a possibly unfinished
 * JSON answer (`{"reply":"Sure — I'll ma` → `Sure — I'll ma`). Null until the
 * field's opening quote has arrived.
 */
export function partialJsonStringField(json: string, field: string): string | null {
  const match = new RegExp(`"${field}"\\s*:\\s*"`).exec(json);
  if (!match) return null;
  let out = "";
  for (let i = match.index + match[0].length; i < json.length; i++) {
    const ch = json[i]!;
    if (ch === '"') return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = json[i + 1];
    if (next === undefined) return out;
    i++;
    if (next === "n") out += "\n";
    else if (next === "t") out += "\t";
    else if (next === "r") continue;
    else if (next === "u") {
      const hex = json.slice(i + 1, i + 5);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else out += next;
  }
  return out;
}
