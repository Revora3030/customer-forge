import type { SupabaseClient } from "@supabase/supabase-js";
import { describeRead, type ReadAction } from "./jarvis-actions";

const MAX_RESULT_CHARS = 8_000;

const bounded = (value: unknown) => {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…[truncated]` : text;
};

/**
 * Runs Jarvis's read actions. Every action maps to existing, code-owned,
 * read-only server logic; the caller has already been verified as super-admin.
 */
export async function runReadActions(db: SupabaseClient, reads: ReadAction[], actorId: string) {
  return Promise.all(
    reads.map(async (action) => {
      const label = describeRead(action);
      try {
        let result: unknown;
        if (action.id === "diagnostic.run") {
          const { executeJarvisDiagnosticTool } = await import("./jarvis-diagnostic-tools.server");
          result = await executeJarvisDiagnosticTool(db, action.toolId);
        } else if (action.id === "code.read") {
          const { inspectRepository } = await import("./builder/repository-inspection.server");
          const inspection = await inspectRepository(true, `${action.paths.join(" ")} lines ${action.line}`);
          // The inventory is large; code.list is the way to browse it.
          result = "files" in inspection ? { status: inspection.status, sha: inspection.sha, files: inspection.files } : inspection;
        } else if (action.id === "code.list") {
          const { inspectRepository } = await import("./builder/repository-inspection.server");
          const inspection = await inspectRepository(true, `inventory page ${action.page}`);
          result = "inventory" in inspection ? { status: inspection.status, sha: inspection.sha, inventory: inspection.inventory } : inspection;
        } else if (action.id === "web.search") {
          const { searchWeb } = await import("./integrations/research.server");
          result = await searchWeb(action.query, 6);
        } else if (action.id === "prospects.find") {
          const { findProspects } = await import("./jarvis-demo-site.server");
          result = await findProspects(db, actorId, action);
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
