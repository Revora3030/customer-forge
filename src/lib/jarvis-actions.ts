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
import { safeInspectionPath } from "./builder/inspection-paths";

export const MAX_ACTIONS_PER_STEP = 3;
export const MAX_ACTION_STEPS = 3;

export type ReadAction =
  | { id: "diagnostic.run"; toolId: string }
  | { id: "code.read"; paths: string[]; line: number }
  | { id: "code.list"; page: number; dir: string | null }
  | { id: "code.search"; query: string }
  | { id: "demos.list" }
  | { id: "prospects.find"; niche: string; city: string; state: string | null }
  | { id: "web.search"; query: string };

export type CodeChange =
  | { path: string; edits: { find: string; replace: string }[] }
  | { path: string; content: string };

export type PullRequestProposal = { title: string; summary: string; changes: CodeChange[] };

export type WriteProposal =
  | { id: "demo.build"; input: ProspectDemoInput }
  | { id: "code.pr"; pr: PullRequestProposal }
  | { id: "claude.code"; request: string }
  | { id: "builds.recover" };

export const MAX_PR_FILES = 6;
export const MAX_PR_CHARS = 60_000;

/**
 * Paths Jarvis may change: app source, scripts, docs and new migrations. CI
 * workflows, root config, generated files and secrets are read-only to it.
 */
export function writablePath(path: string): boolean {
  return safeInspectionPath(path) && /^(src|scripts|docs|supabase\/migrations)\//.test(path);
}

/** Validates a pull-request proposal; throws a plain-language reason. */
export function parsePullRequestProposal(value: unknown): PullRequestProposal {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const title = str(raw["title"], 120);
  if (title.length < 8) throw new Error("needs a clear title");
  const summary = str(raw["summary"], 4000);
  if (summary.length < 20) throw new Error("needs a summary of what changes and why");
  const rawChanges = Array.isArray(raw["changes"]) ? raw["changes"] : [];
  if (!rawChanges.length) throw new Error("has no file changes");
  if (rawChanges.length > MAX_PR_FILES) throw new Error(`changes more than ${MAX_PR_FILES} files`);
  const seen = new Set<string>();
  let total = 0;
  const changes: CodeChange[] = rawChanges.map((item) => {
    const change = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const path = str(change["path"], 240);
    if (!writablePath(path)) throw new Error(`can't change ${path || "that path"}`);
    if (seen.has(path)) throw new Error(`lists ${path} twice`);
    seen.add(path);
    if (typeof change["content"] === "string") {
      total += change["content"].length;
      return { path, content: change["content"] };
    }
    const edits = (Array.isArray(change["edits"]) ? change["edits"] : []).slice(0, 20).map((edit) => {
      const e = (edit && typeof edit === "object" ? edit : {}) as Record<string, unknown>;
      const find = typeof e["find"] === "string" ? e["find"] : "";
      const replace = typeof e["replace"] === "string" ? e["replace"] : "";
      if (find.trim().length < 8) throw new Error(`has an edit in ${path} without enough text to find`);
      total += find.length + replace.length;
      return { find, replace };
    });
    if (!edits.length) throw new Error(`has no edits for ${path}`);
    return { path, edits };
  });
  if (total > MAX_PR_CHARS) throw new Error("is too large; split it into smaller pull requests");
  return { title, summary, changes };
}

/** Applies exact find/replace edits. Each find must match exactly once. */
export function applyEdits(source: string, edits: { find: string; replace: string }[], path: string): string {
  let out = source;
  for (const edit of edits) {
    const first = out.indexOf(edit.find);
    if (first === -1) throw new Error(`${path}: text to replace was not found. Read the file again and retry.`);
    if (out.indexOf(edit.find, first + 1) !== -1) throw new Error(`${path}: text to replace appears more than once; include more context.`);
    out = out.slice(0, first) + edit.replace + out.slice(first + edit.find.length);
  }
  return out;
}

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
    '- {"id":"code.search","args":{"query":"getPlatformMetrics"}}: find files whose path or contents match (a function, component, table, route or error text). Use it first instead of guessing paths.',
    '- {"id":"code.list","args":{"dir":"src/lib","page":1}}: list files in a folder of the live lovable-sync branch (300 per page). Without dir it lists everything plus a folder map.',
    '- {"id":"code.read","args":{"paths":["src/..."],"line":1}}: read up to 3 files, 300 numbered lines each, from line. A missing path comes back with didYouMean suggestions; to keep reading a long file, call again with the line it gives.',
    '- {"id":"demos.list","args":{}}: list prospect demo sites with build status and preview links.',
    '- {"id":"web.search","args":{"query":"..."}}: search the live web (Perplexity, Tavily, Brave, Exa or Jina, whichever is connected) for current facts: competitors, pricing in a market, a provider\'s docs or an error message. Results are third-party research; cite the URLs and never present them as facts about a customer.',
    '- {"id":"prospects.find","args":{"niche":"mobile detailing","city":"Raleigh","state":"NC"}}: search Google Places for businesses in a niche and city that have no real website (none, or only a social/directory page). Costs a little per search and is capped daily, so search only when the owner asks for prospects. Then propose demo.build for the best ones, using only the facts returned (name, category, city, state, phone); for services use none and set description to "<category> serving <city, state>."',
    '- {"id":"demo.build","args":{"businessName":"","industry":"","city":"","state":"","phone":"","email":"","services":["..."],"description":""}}: PROPOSE building a private demo website for a real business with no website. Only facts the owner gave you; never invent phone numbers, emails or services. The owner approves with one tap; you do not run it.',
    '- {"id":"code.pr","args":{"title":"","summary":"","changes":[{"path":"src/...","edits":[{"find":"exact existing text","replace":"new text"}]},{"path":"src/new-file.ts","content":"full file"}]}}: PROPOSE a GitHub pull request into lovable-sync. Read every file you edit with code.read first in this conversation; "find" must be copied exactly from it and appear once. Use "content" only for new files. Up to 6 files. Keep changes minimal, complete and type-safe; never touch auth, RLS, billing or tenant isolation unless the owner asked; never add secrets. The owner approves with one tap and reviews before merging.',
    '- {"id":"claude.code","args":{"request":"what to build or fix, with the files and acceptance checks you found"}}: PROPOSE handing a larger coding task to Claude Code, which reads the whole repository, edits any number of files, runs the checks and opens a pull request. Use it instead of code.pr when a change spans more than 6 files, needs new tests run, or is too big to write exactly here. The owner approves with one tap.',
    '- {"id":"builds.recover","args":{}}: PROPOSE recovering stalled website builds: closes builds whose worker died, re-queues orphaned ones and restarts the build worker. Suggest it when builder.health.summary shows stuck or long-running builds. The owner approves with one tap.',
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
        .slice(0, 3);
      const line = Math.min(100000, Math.max(1, Math.floor(Number(args["line"]) || 1)));
      if (paths.length) out.reads.push({ id, paths, line });
      else out.rejected.push("code.read: no valid paths");
    } else if (id === "code.list") {
      const dir = str(args["dir"], 200).replace(/^\/+|\/+$/g, "");
      out.reads.push({
        id,
        page: Math.min(1000, Math.max(1, Math.floor(Number(args["page"]) || 1))),
        dir: dir && /^[A-Za-z0-9_./[\]$@-]+$/.test(dir) && !dir.split("/").includes("..") ? dir : null,
      });
    } else if (id === "code.search") {
      const query = str(args["query"], 120);
      if (query.length >= 2) out.reads.push({ id, query });
      else out.rejected.push("code.search: needs a query");
    } else if (id === "demos.list") {
      out.reads.push({ id });
    } else if (id === "web.search") {
      const query = str(args["query"], 300);
      if (query.length >= 3) out.reads.push({ id, query });
      else out.rejected.push("web.search: needs a query");
    } else if (id === "prospects.find") {
      const niche = str(args["niche"], 80);
      const city = str(args["city"], 80);
      if (niche.length >= 3 && city.length >= 2) out.reads.push({ id, niche, city, state: str(args["state"], 40) || null });
      else out.rejected.push("prospects.find: needs a niche and a city");
    } else if (id === "code.pr") {
      try {
        out.proposals.push({ id, pr: parsePullRequestProposal(args) });
      } catch (error) {
        out.rejected.push(`code.pr ${error instanceof Error ? error.message : "is invalid"}`);
      }
    } else if (id === "claude.code") {
      const request = str(args["request"], 8000);
      if (request.length >= 20) out.proposals.push({ id, request });
      else out.rejected.push("claude.code: describe the task in at least a sentence");
    } else if (id === "builds.recover") {
      if (!out.proposals.some((proposal) => proposal.id === "builds.recover")) out.proposals.push({ id });
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
      return `Listed ${action.dir ?? "all"} files (page ${action.page})`;
    case "code.search":
      return `Searched the code for "${action.query.slice(0, 60)}"`;
    case "demos.list":
      return "Listed demo sites";
    case "web.search":
      return `Searched the web for "${action.query.slice(0, 60)}"`;
    case "prospects.find":
      return `Searched Google for ${action.niche} in ${action.city}${action.state ? `, ${action.state}` : ""}`;
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
      try {
        if (proposal?.id === "demo.build") proposals.push({ id: "demo.build", input: parseProspectDemoInput(proposal.input) });
        else if (proposal?.id === "code.pr") proposals.push({ id: "code.pr", pr: parsePullRequestProposal(proposal.pr) });
        else if (proposal?.id === "builds.recover") proposals.push({ id: "builds.recover" });
        else if (proposal?.id === "claude.code" && typeof proposal.request === "string" && proposal.request.trim().length >= 20)
          proposals.push({ id: "claude.code", request: proposal.request.trim().slice(0, 8000) });
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
