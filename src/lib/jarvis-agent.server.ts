import type { SupabaseClient } from "@supabase/supabase-js";
import { describeRead, readsUntrustedText, type ReadAction } from "./jarvis-actions";

const MAX_RESULT_CHARS = 8_000;
// Source reads carry up to 3 x 300 numbered lines; cutting them at 8,000
// characters left Jarvis editing code it never saw.
const MAX_CODE_RESULT_CHARS = 48_000;

const bounded = (value: unknown, max = MAX_RESULT_CHARS) => {
  const text = JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
};

/**
 * The artifacts hub: everything Jarvis has produced, in one list. Demo sites,
 * approvals from the durable audit log, and scheduled routines. Read-only.
 */
async function collectArtifacts(db: SupabaseClient, actorId: string) {
  const { listProspectDemos } = await import("./jarvis-demo-site.server");
  const { listJarvisRoutines } = await import("./jarvis-routines.server");
  // audit_logs has no `details` column (the extra data is `metadata`), and only Jarvis's own entries belong here.
  const readAudit = async (): Promise<{ rows: { action?: unknown; created_at?: unknown }[]; error: string | null }> => {
    try {
      const res = await db.from("audit_logs").select("action, created_at").like("action", "jarvis.%").order("created_at", { ascending: false }).limit(40);
      if (res.error) {
        console.error("[jarvis artifacts] couldn't read the audit log:", res.error.message);
        return { rows: [], error: res.error.message };
      }
      return { rows: res.data ?? [], error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "audit log read failed";
      console.error("[jarvis artifacts] couldn't read the audit log:", message);
      return { rows: [], error: message };
    }
  };
  const [demos, routines, auditRead] = await Promise.all([
    listProspectDemos(db, 50).catch((): Awaited<ReturnType<typeof listProspectDemos>> => []),
    listJarvisRoutines(db, actorId).catch((): Awaited<ReturnType<typeof listJarvisRoutines>> => []),
    readAudit(),
  ]);
  return {
    note: "Everything Jarvis has produced or had approved, newest first. Approvals come from the durable audit log.",
    demoSites: (demos as { name?: string; buildStatus?: string; previewUrl?: string | null }[]).map((demo) => ({
      name: demo.name ?? "Demo site",
      status: demo.buildStatus ?? "unknown",
      preview: demo.previewUrl ?? null,
    })),
    routines: routines.map((routine) => ({ name: routine.name, enabled: routine.enabled, lastStatus: routine.last_status })),
    approvals: (auditRead.rows as { action?: string; created_at?: string }[]).map((row) => ({
      action: row.action ?? "unknown",
      at: row.created_at ?? null,
    })),
    // Shown instead of an empty list that looks like "nothing was approved".
    ...(auditRead.error ? { approvalsError: `Couldn't read the audit log: ${auditRead.error}` } : {}),
  };
}

/**
 * Runs Jarvis's read actions. Every action maps to existing, code-owned,
 * read-only server logic; the caller has already been verified as super-admin.
 */
export async function runReadActions(db: SupabaseClient, reads: ReadAction[], actorId: string, outsideTextSeen = false) {
  // memory.save runs without approval and what it stores is shown to every later
  // chat as owner context. Once this turn has read text from the web, a listing,
  // an inbox message or a prospect's site (this round or an earlier one), planted
  // instructions could ask for a memory, so it is skipped and the owner repeats
  // the request in a plain message.
  const memoryBlocked = outsideTextSeen || readsUntrustedText(reads);
  return Promise.all(
    reads.map(async (action) => {
      const label = describeRead(action);
      if (action.id === "memory.save" && memoryBlocked) {
        return {
          label,
          ok: false,
          result: "Not saved: this turn already read outside text (web, prospects, inbox, site checks or demo names), which can contain planted instructions. Tell the owner to say what to remember in a plain message and it will be saved then.",
        };
      }
      try {
        let result: unknown;
        if (action.id === "instagram.status") {
          const { instagramStatus } = await import("./instagram.server");
          result = await instagramStatus(db, actorId);
        } else if (action.id === "diagnostic.run") {
          const { executeJarvisDiagnosticTool } = await import("./jarvis-diagnostic-tools.server");
          result = await executeJarvisDiagnosticTool(db, action.toolId, action.args ?? {});
        } else if (action.id === "code.read") {
          const { readFiles } = await import("./jarvis-repo.server");
          return { label, ok: true, result: bounded(await readFiles(action.paths, action.line), MAX_CODE_RESULT_CHARS) };
        } else if (action.id === "code.list") {
          const { listFiles } = await import("./jarvis-repo.server");
          return { label, ok: true, result: bounded(await listFiles(action.dir, action.page), MAX_CODE_RESULT_CHARS) };
        } else if (action.id === "code.search") {
          const { searchCode } = await import("./jarvis-repo.server");
          result = await searchCode(action.query);
        } else if (action.id === "web.search") {
          const { searchWeb } = await import("./integrations/research.server");
          result = await searchWeb(action.query, 6);
        } else if (action.id === "prospects.find") {
          const { findProspects } = await import("./jarvis-demo-site.server");
          result = await findProspects(db, actorId, action);
        } else if (action.id === "prospect.lookup") {
          const { prospectFromMaps } = await import("./jarvis-demo-site.server");
          result = await prospectFromMaps(db, actorId, action.input);
        } else if (action.id === "demo.status") {
          const { getDemoStatus } = await import("./prospect-outreach.server");
          let organizationId = action.organizationId;
          if (!organizationId && action.name) {
            const { listProspectDemos } = await import("./jarvis-demo-site.server");
            const wanted = action.name.toLowerCase();
            const demos = await listProspectDemos(db, 100);
            organizationId = (demos.find((demo) => demo.name.toLowerCase() === wanted) ?? demos.find((demo) => demo.name.toLowerCase().includes(wanted)))?.organizationId ?? null;
          }
          const status = organizationId ? await getDemoStatus(db, organizationId) : null;
          if (!status) throw new Error("No demo site matches that. Use demos.list to find it.");
          result = status;
        } else if (action.id === "autopilot.status") {
          const { getAutopilotSettings, listAutopilotRuns } = await import("./prospect-autopilot.server");
          const [settings, runs] = await Promise.all([getAutopilotSettings(db), listAutopilotRuns(db, 5)]);
          result = { settings, recentRuns: runs };
        } else if (action.id === "engine.today") {
          const { getEngineFunnel } = await import("./engine-funnel.server");
          result = await getEngineFunnel(db);
        } else if (action.id === "inbox.list") {
          const { listProspectInbox } = await import("./prospect-replies.server");
          result = await listProspectInbox(db, 20);
        } else if (action.id === "memory.list") {
          const { listJarvisMemories } = await import("./jarvis-memory.server");
          const memories = await listJarvisMemories(db, actorId);
          result = { count: memories.length, memories: memories.map((m) => ({ id: m.id, kind: m.kind, content: m.content, savedAt: m.created_at })) };
        } else if (action.id === "memory.save") {
          const { parseMemoryKind, parseMemoryContent, saveJarvisMemory } = await import("./jarvis-memory.server");
          result = await saveJarvisMemory(db, actorId, parseMemoryKind(action.kind), parseMemoryContent(action.content));
        } else if (action.id === "routines.list") {
          const { listJarvisRoutines } = await import("./jarvis-routines.server");
          const routines = await listJarvisRoutines(db, actorId);
          result = {
            count: routines.length,
            note: "Times are Eastern. Weekly routines run on Mondays.",
            routines: routines.map((r) => ({
              id: r.id, name: r.name, prompt: r.prompt, frequency: r.frequency,
              time: `${String(r.hour).padStart(2, "0")}:${String(r.minute).padStart(2, "0")}`,
              enabled: r.enabled, lastRunAt: r.last_run_at, lastStatus: r.last_status, lastSummary: r.last_summary,
            })),
          };
        } else if (action.id === "artifacts.list") {
          result = await collectArtifacts(db, actorId);
        } else {
          const { listProspectDemos } = await import("./jarvis-demo-site.server");
          result = await listProspectDemos(db);
        }
        return { label, ok: true, result: bounded(result) };
      } catch (error) {
        return { label, ok: false, result: error instanceof Error ? error.message.slice(0, 300) : "failed" };
      }
    }),
  );
}
