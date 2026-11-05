/**
 * JC-45: AI City commands for the Jarvis "/" menu. They sit beside the quick
 * commands (the menu itself is CU-4's). Every prompt asks for real, readable
 * data only and an explicit NOT_VERIFIED where Jarvis can't read something,
 * and none of them acts on its own: anything that writes still goes through
 * the approval cards.
 */

export type CityCommand = { readonly slash: "/city" | "/brief" | "/triage"; readonly hint: string; readonly prompt: string };

export const CITY_COMMANDS: readonly CityCommand[] = [
  {
    slash: "/city",
    hint: "AI City status, district by district",
    prompt:
      "Give me the AI City status from data you can read right now: builds, leads, approvals waiting, money (read-only) and platform health. One line per district with the number and where it came from. Mark anything you can't read as NOT_VERIFIED; never estimate or fill in a number.",
  },
  {
    slash: "/brief",
    hint: "Short brief: what changed, what waits on me, next step",
    prompt:
      "Brief me in five bullets or fewer: what changed since yesterday, what is waiting on me, and the one next step with the most impact. Use only data you can read and say NOT_VERIFIED where you can't. Don't act; propose only.",
  },
  {
    slash: "/triage",
    hint: "Rank what's broken or stuck by impact",
    prompt:
      "Triage what is open right now: failed or stuck builds, error spikes, approvals waiting and stalled runs. Rank by impact on customers first, then revenue. One line each with the evidence and the safe next step. Leave out anything you can't see evidence for, and don't run any fix without my approval.",
  },
];

/** [label, prompt] pairs in the shape CommandPalette already renders. */
export const CITY_COMMAND_ENTRIES: ReadonlyArray<readonly [string, string]> = CITY_COMMANDS.map((c) => [`${c.slash} · ${c.hint}`, c.prompt] as const);

/**
 * If a message is exactly a City command (optionally followed by extra words),
 * returns the full prompt with those words added as a focus line. Anything
 * else comes back unchanged, so "/cityscape" or "see /city" are left alone.
 */
export function expandCityCommand(message: string): string {
  const trimmed = message.trim();
  const head = /^\/(city|brief|triage)(?=\s|$)/i.exec(trimmed);
  if (!head) return message;
  const command = CITY_COMMANDS.find((c) => c.slash === `/${head[1]!.toLowerCase()}`);
  if (!command) return message;
  const extra = trimmed.slice(head[0].length).trim();
  return extra ? `${command.prompt}\nFocus: ${extra}` : command.prompt;
}
