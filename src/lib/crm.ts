/**
 * CRM helpers (spec G): CSV export and follow-up task rules.
 *
 * Pure so the leads page, tests and any server export share them. The CSV
 * writer neutralises spreadsheet formula injection (a cell starting with
 * = + - @ tab or CR is prefixed with a quote), because lead fields come from
 * public website forms.
 */
import { CRM_STAGES, crmStageOf, leadStatusMeta, type CrmStageKey } from "@/lib/domain";
import type { LeadStatus } from "@/lib/domain";

export type ExportLead = {
  name: string | null;
  email?: string | null;
  phone?: string | null;
  status: LeadStatus;
  source?: string | null;
  service_interest?: string | null;
  city?: string | null;
  estimated_value?: number | string | null;
  next_follow_up_at?: string | null;
  created_at: string;
};

const FORMULA = /^[=+\-@\t\r]/;

/** One CSV cell: quoted, quotes doubled, formula-injection neutralised. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const LEAD_CSV_COLUMNS = [
  "Name",
  "Email",
  "Phone",
  "Pipeline stage",
  "Status",
  "Source",
  "Interested in",
  "City",
  "Job value",
  "Next follow-up",
  "Created",
] as const;

/** RFC 4180 CSV (CRLF line endings) of the given leads. */
export function leadsToCsv(leads: readonly ExportLead[]): string {
  const stageLabel = (status: LeadStatus) => CRM_STAGES.find((s) => s.key === crmStageOf(status))?.label ?? "";
  const lines = [LEAD_CSV_COLUMNS.map(csvCell).join(",")];
  for (const lead of leads) {
    lines.push(
      [
        lead.name,
        lead.email,
        lead.phone,
        stageLabel(lead.status),
        leadStatusMeta(lead.status).label,
        lead.source,
        lead.service_interest,
        lead.city,
        lead.estimated_value === null || lead.estimated_value === undefined ? "" : Number(lead.estimated_value),
        lead.next_follow_up_at,
        lead.created_at,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Groups leads into the five pipeline stages, in order. */
export function groupByStage<T extends { status: LeadStatus }>(leads: readonly T[]): { key: CrmStageKey; label: string; leads: T[] }[] {
  return CRM_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    leads: leads.filter((lead) => crmStageOf(lead.status) === stage.key),
  }));
}

export type LeadTask = { id: string; title: string; due_at: string | null; done_at: string | null };

export type TaskState = "done" | "overdue" | "due_today" | "upcoming" | "no_date";

/** Where a task stands relative to now, in the owner's local day. */
export function taskState(task: Pick<LeadTask, "due_at" | "done_at">, now = new Date()): TaskState {
  if (task.done_at) return "done";
  if (!task.due_at) return "no_date";
  const due = new Date(task.due_at);
  if (Number.isNaN(due.getTime())) return "no_date";
  if (due.getTime() < now.getTime()) {
    return due.toDateString() === now.toDateString() ? "due_today" : "overdue";
  }
  return due.toDateString() === now.toDateString() ? "due_today" : "upcoming";
}

/** Open tasks first (overdue, today, upcoming, undated), then done; by due date. */
export function sortTasks<T extends LeadTask>(tasks: readonly T[], now = new Date()): T[] {
  const rank: Record<TaskState, number> = { overdue: 0, due_today: 1, upcoming: 2, no_date: 3, done: 4 };
  return [...tasks].sort((a, b) => {
    const diff = rank[taskState(a, now)] - rank[taskState(b, now)];
    if (diff) return diff;
    return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
  });
}

/** Validated task title (1–200 chars, trimmed), or null. */
export function normaliseTaskTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim().slice(0, 200);
  return title.length ? title : null;
}
