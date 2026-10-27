/**
 * The event bus: independent event sources, collected together. A source that
 * fails is reported by name instead of being treated as "no events", so a
 * broken reader can never make the platform look calm.
 */
import type { PlatformEvent } from "@/lib/cognition/event-rules";

export type EventSource = { name: string; read: (now: number) => Promise<readonly PlatformEvent[]> };

export type CollectedEvents = {
  events: PlatformEvent[];
  /** Sources that threw, by name. */
  failedSources: string[];
  /** Events beyond the cap that were left out. */
  dropped: number;
};

export const MAX_COLLECTED_EVENTS = 200;

export async function collectEvents(sources: readonly EventSource[], now: number, cap = MAX_COLLECTED_EVENTS): Promise<CollectedEvents> {
  const settled = await Promise.all(
    sources.map(async (source) => {
      try {
        return { name: source.name, events: await source.read(now), failed: false };
      } catch {
        return { name: source.name, events: [] as readonly PlatformEvent[], failed: true };
      }
    }),
  );
  const seen = new Set<string>();
  const events: PlatformEvent[] = [];
  for (const result of settled) {
    for (const event of result.events) {
      const key = `${event.type}|${event.id}`;
      if (seen.has(key) || !Number.isFinite(event.occurredAt)) continue;
      seen.add(key);
      events.push(event);
    }
  }
  events.sort((a, b) => b.occurredAt - a.occurredAt);
  return {
    events: events.slice(0, cap),
    failedSources: settled.filter((result) => result.failed).map((result) => result.name),
    dropped: Math.max(0, events.length - cap),
  };
}
