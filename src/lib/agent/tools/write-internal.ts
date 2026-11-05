/**
 * PAI-11: undoable internal write tools (risk write_internal, scope owner).
 *
 * Model-callable: leads.update_status, leads.add_note, leads.add_tag,
 * leads.create_task, quotes.draft, bookings.add_note, automations.toggle.
 *
 * Undo-only helpers (leads.restore_notes, leads.restore_customer_tags,
 * leads.delete_task, quotes.delete_draft, bookings.restore_notes) stay inside
 * writeInternalUndoHelpers / undoRunWrites — never listed to the model.
 *
 * Every write returns an inverse that restores prior values. No tool deletes a
 * lead. Tags: when the lead is linked to a customer, the tag is added to
 * customers.tags; otherwise a reversible `⟦tags:…⟧` marker is kept at the end
 * of lead.notes (leads have no tags column — no migration in this PR).
 */
import { z } from "zod";
import { defineToolV2, type ToolDefinitionV2, type ToolInverse } from "@/lib/ai/tool-registry-v2.server";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/domain";
import { db, readFailed } from "./shared";

const id = z.string().uuid();
const leadStatuses = LEAD_STATUSES.map((s) => s.value) as [LeadStatus, ...LeadStatus[]];
const TAG_MARKER = /⟦tags:([^\]]*)⟧\s*$/;

function writeFailed(error: unknown): never {
  void error;
  throw new Error("You don't have access to that workspace, or the change couldn't be saved.");
}

function parseTagMarker(notes: string | null): { body: string; tags: string[] } {
  const raw = notes ?? "";
  const match = raw.match(TAG_MARKER);
  if (!match) return { body: raw.replace(/\s+$/, ""), tags: [] };
  const body = raw.slice(0, match.index).replace(/\s+$/, "");
  const tags = (match[1] ?? "")
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);
  return { body, tags };
}

function withTagMarker(body: string, tags: string[]): string {
  const unique = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  if (!unique.length) return body;
  const marker = `⟦tags:${unique.join("|")}⟧`;
  return body ? `${body}\n${marker}` : marker;
}

async function loadLead(context: Parameters<typeof db>[0], leadId: string) {
  const { data, error } = await db(context)
    .from("leads")
    .select("id, status, notes, customer_id, organization_id")
    .eq("id", leadId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error) readFailed(error);
  if (!data) throw new Error("That lead isn't in this workspace.");
  return data as {
    id: string;
    status: LeadStatus;
    notes: string | null;
    customer_id: string | null;
    organization_id: string;
  };
}

/** Undo helpers only — used by undoRunWrites, not by agentTools / the model. */
export function writeInternalUndoHelpers(): ToolDefinitionV2<z.ZodType>[] {
  return buildWriteInternalTools().undoHelpers;
}

/** Model-callable PAI-11 writes (no undo-only helpers). */
export function writeInternalTools(): ToolDefinitionV2<z.ZodType>[] {
  return buildWriteInternalTools().publicTools;
}

/** Public writes + undo helpers — for tests and undoRunWrites registries. */
export function writeInternalAllTools(): ToolDefinitionV2<z.ZodType>[] {
  const built = buildWriteInternalTools();
  return [...built.publicTools, ...built.undoHelpers];
}

function buildWriteInternalTools(): {
  publicTools: ToolDefinitionV2<z.ZodType>[];
  undoHelpers: ToolDefinitionV2<z.ZodType>[];
} {
  const updateStatus = defineToolV2({
    name: "leads.update_status",
    description: "Move a lead to a new CRM status. Cannot delete a lead.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ leadId: id, status: z.enum(leadStatuses) }),
    run: async (input, context) => {
      const prior = await loadLead(context, input.leadId);
      const priorStatus = prior.status;
      const { data, error } = await db(context)
        .from("leads")
        .update({ status: input.status })
        .eq("id", input.leadId)
        .eq("organization_id", context.organizationId)
        .select("id, status");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That lead couldn't be updated.");
      return { leadId: input.leadId, status: input.status, priorStatus };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { leadId: string; priorStatus: LeadStatus };
      return { tool: "leads.update_status", arguments: { leadId: row.leadId, status: row.priorStatus } };
    },
  });

  const restoreNotes = defineToolV2({
    name: "leads.restore_notes",
    description: "Restore a lead's notes to a previous value (undo helper).",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ leadId: id, notes: z.string().nullable() }),
    run: async (input, context) => {
      const { data, error } = await db(context)
        .from("leads")
        .update({ notes: input.notes })
        .eq("id", input.leadId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That lead couldn't be updated.");
      return { leadId: input.leadId, notes: input.notes };
    },
    inverse: () => null,
  });

  const addNote = defineToolV2({
    name: "leads.add_note",
    description: "Append a note to a lead. Prior notes are kept and can be undone.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ leadId: id, note: z.string().trim().min(1).max(2000) }),
    run: async (input, context) => {
      const prior = await loadLead(context, input.leadId);
      const priorNotes = prior.notes;
      const next = priorNotes?.trim() ? `${priorNotes.trim()}\n${input.note.trim()}` : input.note.trim();
      const { data, error } = await db(context)
        .from("leads")
        .update({ notes: next })
        .eq("id", input.leadId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That lead couldn't be updated.");
      return { leadId: input.leadId, notes: next, priorNotes };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { leadId: string; priorNotes: string | null };
      return { tool: "leads.restore_notes", arguments: { leadId: row.leadId, notes: row.priorNotes } };
    },
  });

  const addTag = defineToolV2({
    name: "leads.add_tag",
    description:
      "Add a short tag to a lead. Uses the linked customer's tags when present; otherwise stores a reversible tag marker on the lead notes (no tags column on leads).",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ leadId: id, tag: z.string().trim().min(1).max(40) }),
    run: async (input, context) => {
      const prior = await loadLead(context, input.leadId);
      const priorNotes = prior.notes;
      const priorCustomerId = prior.customer_id;
      const tag = input.tag.trim().toLowerCase();
      if (priorCustomerId) {
        const { data: customer, error: readError } = await db(context)
          .from("customers")
          .select("id, tags")
          .eq("id", priorCustomerId)
          .eq("organization_id", context.organizationId)
          .maybeSingle();
        if (readError) readFailed(readError);
        if (!customer) throw new Error("That lead's customer isn't in this workspace.");
        const priorTags = Array.isArray(customer.tags) ? [...(customer.tags as string[])] : [];
        if (priorTags.map((t) => t.toLowerCase()).includes(tag)) {
          return { leadId: input.leadId, via: "customer" as const, tag, priorTags, unchanged: true };
        }
        const nextTags = [...priorTags, tag];
        const { data, error } = await db(context)
          .from("customers")
          .update({ tags: nextTags })
          .eq("id", priorCustomerId)
          .eq("organization_id", context.organizationId)
          .select("id");
        if (error) writeFailed(error);
        if (!data?.length) throw new Error("That customer couldn't be updated.");
        return {
          leadId: input.leadId,
          customerId: priorCustomerId,
          via: "customer" as const,
          tag,
          priorTags,
          tags: nextTags,
        };
      }
      const parsed = parseTagMarker(priorNotes);
      if (parsed.tags.map((t) => t.toLowerCase()).includes(tag)) {
        return { leadId: input.leadId, via: "notes" as const, tag, priorNotes, unchanged: true };
      }
      const nextNotes = withTagMarker(parsed.body, [...parsed.tags, tag]);
      const { data, error } = await db(context)
        .from("leads")
        .update({ notes: nextNotes })
        .eq("id", input.leadId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That lead couldn't be updated.");
      return { leadId: input.leadId, via: "notes" as const, tag, priorNotes, notes: nextNotes };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as {
        leadId: string;
        via: "customer" | "notes";
        unchanged?: boolean;
        customerId?: string;
        priorTags?: string[];
        priorNotes?: string | null;
      };
      if (row.unchanged) return null;
      if (row.via === "customer" && row.customerId) {
        return {
          tool: "leads.restore_customer_tags",
          arguments: { customerId: row.customerId, tags: row.priorTags ?? [] },
        };
      }
      return { tool: "leads.restore_notes", arguments: { leadId: row.leadId, notes: row.priorNotes ?? null } };
    },
  });

  const restoreCustomerTags = defineToolV2({
    name: "leads.restore_customer_tags",
    description: "Restore a customer's tags array (undo helper for leads.add_tag).",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ customerId: id, tags: z.array(z.string().max(40)).max(50) }),
    run: async (input, context) => {
      const { data, error } = await db(context)
        .from("customers")
        .update({ tags: input.tags })
        .eq("id", input.customerId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That customer couldn't be updated.");
      return { customerId: input.customerId, tags: input.tags };
    },
    inverse: () => null,
  });

  const deleteTask = defineToolV2({
    name: "leads.delete_task",
    description: "Delete one lead task by id (undo helper for create_task). Never deletes a lead.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ taskId: id }),
    run: async (input, context) => {
      const { data, error } = await db(context)
        .from("lead_tasks")
        .delete()
        .eq("id", input.taskId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That task couldn't be removed.");
      return { taskId: input.taskId };
    },
    inverse: () => null,
  });

  const createTask = defineToolV2({
    name: "leads.create_task",
    description: "Create a follow-up task on a lead.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({
      leadId: id,
      title: z.string().trim().min(1).max(160),
      dueAt: z.string().datetime().nullable().optional(),
    }),
    run: async (input, context) => {
      await loadLead(context, input.leadId);
      const { data, error } = await db(context)
        .from("lead_tasks")
        .insert({
          organization_id: context.organizationId,
          lead_id: input.leadId,
          title: input.title.trim(),
          due_at: input.dueAt ?? null,
          created_by: context.userId,
        })
        .select("id, title, due_at");
      if (error) writeFailed(error);
      const row = data?.[0] as { id: string; title: string; due_at: string | null } | undefined;
      if (!row) throw new Error("That task couldn't be created.");
      return { taskId: row.id, leadId: input.leadId, title: row.title, dueAt: row.due_at };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { taskId: string };
      return { tool: "leads.delete_task", arguments: { taskId: row.taskId } };
    },
  });

  const deleteDraft = defineToolV2({
    name: "quotes.delete_draft",
    description: "Delete a draft quote by id (undo helper). Refuses non-draft quotes.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ quoteId: id }),
    run: async (input, context) => {
      const { data: existing, error: readError } = await db(context)
        .from("quotes")
        .select("id, status")
        .eq("id", input.quoteId)
        .eq("organization_id", context.organizationId)
        .maybeSingle();
      if (readError) readFailed(readError);
      if (!existing) throw new Error("That quote isn't in this workspace.");
      if (existing.status !== "draft") throw new Error("Only a draft quote can be removed by undo.");
      const { data, error } = await db(context)
        .from("quotes")
        .delete()
        .eq("id", input.quoteId)
        .eq("organization_id", context.organizationId)
        .eq("status", "draft")
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That draft quote couldn't be removed.");
      return { quoteId: input.quoteId };
    },
    inverse: () => null,
  });

  const quotesDraft = defineToolV2({
    name: "quotes.draft",
    description: "Create a draft quote for a lead or named customer. Does not send it.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({
      customerName: z.string().trim().min(1).max(160),
      leadId: id.nullable().optional(),
      customerEmail: z.string().email().nullable().optional(),
      customerPhone: z.string().trim().max(40).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
      lines: z
        .array(
          z.strictObject({
            name: z.string().trim().min(1).max(160),
            unitPrice: z.number().finite().min(0),
            quantity: z.number().finite().positive().max(10_000),
            serviceId: id.nullable().optional(),
          }),
        )
        .max(40)
        .optional(),
    }),
    run: async (input, context) => {
      if (input.leadId) await loadLead(context, input.leadId);
      const { data, error } = await db(context)
        .from("quotes")
        .insert({
          organization_id: context.organizationId,
          customer_name: input.customerName.trim(),
          customer_email: input.customerEmail ?? null,
          customer_phone: input.customerPhone ?? null,
          lead_id: input.leadId ?? null,
          notes: input.notes ?? null,
          status: "draft",
        })
        .select("id");
      if (error) writeFailed(error);
      const quoteId = (data?.[0] as { id: string } | undefined)?.id;
      if (!quoteId) throw new Error("That quote couldn't be created.");
      const lines = input.lines ?? [];
      if (lines.length) {
        const { error: lineError } = await db(context).from("quote_line_items").insert(
          lines.map((line, index) => ({
            organization_id: context.organizationId,
            quote_id: quoteId,
            name: line.name.trim(),
            unit_price: line.unitPrice,
            quantity: line.quantity,
            service_id: line.serviceId ?? null,
            sort_order: index,
          })),
        );
        if (lineError) {
          await db(context)
            .from("quotes")
            .delete()
            .eq("id", quoteId)
            .eq("organization_id", context.organizationId);
          writeFailed(lineError);
        }
      }
      return { quoteId, status: "draft" as const, lineCount: lines.length };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { quoteId: string };
      return { tool: "quotes.delete_draft", arguments: { quoteId: row.quoteId } };
    },
  });

  const restoreBookingNotes = defineToolV2({
    name: "bookings.restore_notes",
    description: "Restore an appointment's notes (undo helper).",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ appointmentId: id, notes: z.string().nullable() }),
    run: async (input, context) => {
      const { data, error } = await db(context)
        .from("appointments")
        .update({ notes: input.notes })
        .eq("id", input.appointmentId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That booking couldn't be updated.");
      return { appointmentId: input.appointmentId, notes: input.notes };
    },
    inverse: () => null,
  });

  const bookingsAddNote = defineToolV2({
    name: "bookings.add_note",
    description: "Append a note to a booking. Prior notes can be restored.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ appointmentId: id, note: z.string().trim().min(1).max(2000) }),
    run: async (input, context) => {
      const { data: prior, error: readError } = await db(context)
        .from("appointments")
        .select("id, notes")
        .eq("id", input.appointmentId)
        .eq("organization_id", context.organizationId)
        .maybeSingle();
      if (readError) readFailed(readError);
      if (!prior) throw new Error("That booking isn't in this workspace.");
      const priorNotes = (prior.notes as string | null) ?? null;
      const next = priorNotes?.trim() ? `${priorNotes.trim()}\n${input.note.trim()}` : input.note.trim();
      const { data, error } = await db(context)
        .from("appointments")
        .update({ notes: next })
        .eq("id", input.appointmentId)
        .eq("organization_id", context.organizationId)
        .select("id");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That booking couldn't be updated.");
      return { appointmentId: input.appointmentId, notes: next, priorNotes };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { appointmentId: string; priorNotes: string | null };
      return {
        tool: "bookings.restore_notes",
        arguments: { appointmentId: row.appointmentId, notes: row.priorNotes },
      };
    },
  });

  const automationsToggle = defineToolV2({
    name: "automations.toggle",
    description: "Turn one automation on or off.",
    risk: "write_internal",
    scope: "owner",
    schema: z.strictObject({ automationId: id, isActive: z.boolean() }),
    run: async (input, context) => {
      const { data: prior, error: readError } = await db(context)
        .from("automations")
        .select("id, is_active")
        .eq("id", input.automationId)
        .eq("organization_id", context.organizationId)
        .maybeSingle();
      if (readError) readFailed(readError);
      if (!prior) throw new Error("That automation isn't in this workspace.");
      const priorIsActive = Boolean(prior.is_active);
      const { data, error } = await db(context)
        .from("automations")
        .update({ is_active: input.isActive })
        .eq("id", input.automationId)
        .eq("organization_id", context.organizationId)
        .select("id, is_active");
      if (error) writeFailed(error);
      if (!data?.length) throw new Error("That automation couldn't be updated.");
      return {
        automationId: input.automationId,
        isActive: input.isActive,
        priorIsActive,
      };
    },
    inverse: (_input, result): ToolInverse | null => {
      const row = result as { automationId: string; priorIsActive: boolean };
      return {
        tool: "automations.toggle",
        arguments: { automationId: row.automationId, isActive: row.priorIsActive },
      };
    },
  });

  const publicTools = [
    updateStatus,
    addNote,
    addTag,
    createTask,
    quotesDraft,
    bookingsAddNote,
    automationsToggle,
  ] as unknown as ToolDefinitionV2<z.ZodType>[];

  const undoHelpers = [
    restoreNotes,
    restoreCustomerTags,
    deleteTask,
    deleteDraft,
    restoreBookingNotes,
  ] as unknown as ToolDefinitionV2<z.ZodType>[];

  return { publicTools, undoHelpers };
}
