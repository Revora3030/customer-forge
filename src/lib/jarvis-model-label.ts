/** Friendly names for recorded model calls; never derived from settings. */
type ModelEvent = { model: string | null; provider: string | null; status: string };

const PROVIDER_NAMES: Record<string, string> = { lovable: "Lovable", openai: "OpenAI", google: "Google", anthropic: "Anthropic" };

export function formatModelLabel(model: string | null | undefined, provider?: string | null): string | null {
  if (!model) return null;
  const bare = model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  const name = bare
    .split("-")
    .map((part) => (/^gpt$/i.test(part) ? "GPT" : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ")
    .replace(/^GPT (\d)/, "GPT-$1")
    .replace(/(\d) (\d)\b/g, "$1.$2");
  const who = provider ? PROVIDER_NAMES[provider] ?? provider : null;
  return who ? `${name} · ${who}` : name;
}

/** The model that wrote the final answer: the last successful recorded model call. */
export function answeringModel(events: ModelEvent[]): { label: string; backup: boolean } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.model && e.status !== "failed" && e.status !== "rejected") {
      const label = formatModelLabel(e.model, e.provider);
      if (label) return { label, backup: e.provider !== "lovable" };
    }
  }
  return null;
}
