/**
 * Jarvis chat actions.
 *
 * Jarvis may ask for actions by ending a reply with
 * `<actions>[{"id": "...", "args": {...}}]</actions>`. Only the IDs below exist.
 * Read actions run on the server immediately and their results go back to
 * Jarvis. Write actions are never run by the model: they come back as
 * proposals the owner approves with one tap, and the approval calls the same
 * validated server function a human would. Model output never becomes code,
 * SQL, URLs or credentials.
 */
import { parseProspectDemoInput, type ProspectDemoInput } from "./jarvis-demo-site";

export const MAX_ACTIONS_PER_STEP = 3;
export const MAX_ACTION_STEPS = 3;

export type ReadAction =
  | { id: "diagnostic.run"; toolId: string }
  | { id: "code.read"; paths: string[]; line: number }
  | { id: "code.list"; page: number }
  | { id: "demos.list" };

export type WriteProposal = { id: "demo.build"; input: ProspectDemoInput };

export type ParsedActions = {
  reads: ReadAction[];
  proposals: WriteProposal[];
  rejected: string[];
};

/** Catalogue shown to the model. Kept short; arguments are validated below. */
export function actionCatalogPrompt(diagnosticToolIds: string[]): string {
  return [
    "ACTIONS. You can act, not just advise. To use one, end your reply with <actions>[...]</actions> holding up to 3 JSON objects, and nothing after it. You will get the results and can then answer or act again.",
    `- {"id":"diagnostic.run","args":{"toolId":ONE_OF ${JSON.stringify(diagnosticToolIds)}}}: run a read-only platform check (errors, builds, schema, SEO, AI providers, connectors, funnel, CI, security, capability scorecard).`,
    '- {"id":"code.list","args":{"page":1}}: list source files in the live repository branch (200 per page).',
    '- {"id":"code.read","args":{"paths":["src/..."],"line":1}}: read up to 2 source files, 120 lines each, starting at line. Use code.list first if unsure of a path.',
    '- {"id":"demos.list","args":{}}: list prospect demo sites with build status and preview links.',
    '- {"id":"demo.build","args":{"businessName":"","industry":"","city":"","state":"","phone":"","email":"","services":["..."],"description":""}}: PROPOSE building a private demo website for a real business with no website. Only facts the owner gave you; never invent phone numbers, emails or services. The owner approves with one tap; you do not run it.',
    "Use actions whenever they would make your answer more accurate. Prefer checking over guessing. Never claim an action ran unless you received its result.",
  ].join("\n");
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function extractActionBlock(raw: string): { text: string; requested: unknown[] } {
  const matches = [...raw.matchAll(/<actions>([\s\S]*?)<\/actions>/gi)];
  const text = raw.replace(/<actions>[\s\S]*?<\/actions>/gi, "").trim();
  const requested: unknown[] = [];
  for (const match of matches) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? "");
      if (Array.isArray(parsed)) requested.push(...parsed);
    } catch {
      requested.push({ id: "__invalid_json__" });
    }
  }
  return { text, requested };
}

export function parseActions(requested: unknown[], diagnosticToolIds: string[]): ParsedActions {
  const out: ParsedActions = { reads: [], proposals: [], rejected: [] };
  for (const item of requested.slice(0, MAX_ACTIONS_PER_STEP)) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = str(raw["id"], 60);
    const args = (raw["args"] && typeof raw["args"] === "object" ? raw["args"] : {}) as Record<string, unknown>;
    if (id === "diagnostic.run") {
      const toolId = str(args["toolId"], 120);
      if (diagnosticToolIds.includes(toolId)) out.reads.push({ id, toolId });
      else out.rejected.push(`diagnostic.run: unknown toolId "${toolId}"`);
    } else if (id === "code.read") {
      const paths = (Array.isArray(args["paths"]) ? args["paths"] : [])
        .map((path) => str(path, 240))
        .filter((path) => /^[A-Za-z0-9_./[\]$@-]+$/.test(path))
        .slice(0, 2);
      const line = Math.min(100000, Math.max(1, Math.floor(Number(args["line"]) || 1)));
      if (paths.length) out.reads.push({ id, paths, line });
      else out.rejected.push("code.read: no valid paths");
    } else if (id === "code.list") {
      out.reads.push({ id, page: Math.min(1000, Math.max(1, Math.floor(Number(args["page"]) || 1))) });
    } else if (id === "demos.list") {
      out.reads.push({ id });
    } else if (id === "demo.build") {
      try {
        out.proposals.push({ id, input: parseProspectDemoInput(args) });
      } catch (error) {
        out.rejected.push(`demo.build: ${error instanceof Error ? error.message : "invalid details"}`);
      }
    } else {
      out.rejected.push(`unknown action "${id}"`);
    }
  }
  if (requested.length > MAX_ACTIONS_PER_STEP) out.rejected.push(`only ${MAX_ACTIONS_PER_STEP} actions run per step`);
  return out;
}

export function describeRead(action: ReadAction): string {
  switch (action.id) {
    case "diagnostic.run":
      return `Ran ${action.toolId}`;
    case "code.read":
      return `Read ${action.paths.join(", ")} from line ${action.line}`;
    case "code.list":
      return `Listed source files (page ${action.page})`;
    case "demos.list":
      return "Listed demo sites";
  }
}

/** Metadata stored with a reply so actions and proposals survive reloads. */
export type JarvisReplyMeta = { ran: string[]; proposals: WriteProposal[] };

const META_PATTERN = /<jarvis-meta>([\s\S]*?)<\/jarvis-meta>/i;

export function appendReplyMeta(reply: string, meta: JarvisReplyMeta): string {
  if (!meta.ran.length && !meta.proposals.length) return reply;
  return `${reply}\n<jarvis-meta>${JSON.stringify(meta)}</jarvis-meta>`;
}

export function splitReplyMeta(content: string): { body: string; meta: JarvisReplyMeta } {
  const match = content.match(META_PATTERN);
  const body = content.replace(/<jarvis-meta>[\s\S]*?<\/jarvis-meta>/gi, "").trim();
  const empty: JarvisReplyMeta = { ran: [], proposals: [] };
  if (!match) return { body, meta: empty };
  try {
    const parsed = JSON.parse(match[1] ?? "") as Partial<JarvisReplyMeta>;
    const ran = Array.isArray(parsed.ran) ? parsed.ran.filter((item): item is string => typeof item === "string").slice(0, 12) : [];
    const proposals: WriteProposal[] = [];
    for (const proposal of Array.isArray(parsed.proposals) ? parsed.proposals.slice(0, 5) : []) {
      if (proposal?.id !== "demo.build") continue;
      try {
        proposals.push({ id: "demo.build", input: parseProspectDemoInput(proposal.input) });
      } catch {
        /* drop anything that no longer validates */
      }
    }
    return { body, meta: { ran, proposals } };
  } catch {
    return { body, meta: empty };
  }
}

/** Plain text for speech: no tags, markdown symbols or meta. */
export function speakableText(content: string): string {
  return content
    .replace(/<followups>[\s\S]*?<\/followups>/gi, " ")
    .replace(/<jarvis-meta>[\s\S]*?<\/jarvis-meta>/gi, " ")
    .replace(/<actions>[\s\S]*?<\/actions>/gi, " ")
    .replace(/```[\s\S]*?```/g, " (code block omitted) ")
    .replace(/[#*_\x60>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}
