/** Client-safe rules for Jarvis conversations (ids, titles, search terms). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseConversationId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("That conversation link isn't valid.");
  return value.toLowerCase();
}

/** First line of the opening message, trimmed to 60 characters. */
export function conversationTitle(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  if (!line) return "New conversation";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

export function parseRenameTitle(value: unknown): string {
  if (typeof value !== "string") throw new Error("Give the conversation a name.");
  const title = value.replace(/\s+/g, " ").trim();
  if (!title) throw new Error("Give the conversation a name.");
  if (title.length > 120) throw new Error("Keep the name under 120 characters.");
  return title;
}

/** Search text safe for a PostgREST ilike filter: no wildcards or filter syntax. */
export function parseSearchTerm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const term = value.replace(/[%_*,()\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return term.length >= 2 ? term : null;
}
