/**
 * Follow-up tasks and reminders on a lead (spec G), plus a workspace-wide
 * "due" strip. Tasks are tenant-scoped rows in lead_tasks (RLS: members read,
 * staff+ write, manager+ delete); a task can only reference a lead of the same
 * workspace (composite foreign key).
 */
import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sortTasks, taskState, type TaskState } from "@/lib/crm";
import { useLeadTaskActions, useLeadTasks } from "@/lib/lead-tasks.hooks";
import { relative } from "@/lib/format";

const STATE_LABEL: Record<TaskState, string> = {
  overdue: "Overdue",
  due_today: "Today",
  upcoming: "Upcoming",
  no_date: "No date",
  done: "Done",
};
const STATE_TONE = { overdue: "danger", due_today: "attention", upcoming: "info", no_date: "neutral", done: "neutral" } as const;

export function LeadTasks({ organizationId, leadId }: { organizationId: string | undefined; leadId: string }) {
  const { data: tasks } = useLeadTasks(organizationId, leadId);
  const { add, toggle, remove } = useLeadTaskActions(organizationId);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const list = sortTasks(tasks ?? []);

  return (
    <section aria-label="Tasks" className="space-y-2">
      <p className="eyebrow">Tasks &amp; reminders</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          add.mutate(
            { leadId, title, dueAt: due ? new Date(`${due}T09:00:00`).toISOString() : null },
            {
              onSuccess: () => {
                setTitle("");
                setDue("");
              },
            },
          );
        }}
      >
        <Input
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Send the quote"
          aria-label="New task"
          className="min-w-40 flex-1"
        />
        <Input type="date" value={due} onChange={(event) => setDue(event.target.value)} aria-label="Due date" className="w-40" />
        <Button type="submit" size="sm" variant="outline" disabled={add.isPending || !title.trim()}>
          <Plus className="size-3.5" /> Add
        </Button>
      </form>
      {list.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((task) => {
            const state = taskState(task);
            return (
              <li key={task.id} className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-1.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: task.id, done: !task.done_at })}
                  aria-pressed={Boolean(task.done_at)}
                  aria-label={task.done_at ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
                  className="grid size-6 shrink-0 cursor-pointer place-items-center rounded border border-border hover:border-primary"
                >
                  {task.done_at ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                </button>
                <span className={task.done_at ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{task.title}</span>
                <Pill tone={STATE_TONE[state]}>
                  {STATE_LABEL[state]}
                  {task.due_at && state !== "done" ? ` · ${relative(task.due_at)}` : ""}
                </Pill>
                <button
                  type="button"
                  onClick={() => remove.mutate(task.id)}
                  aria-label={`Delete “${task.title}”`}
                  className="grid size-7 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Open tasks across the workspace that are overdue or due today. */
export function DueTasksStrip({
  organizationId,
  leadName,
  onOpenLead,
}: {
  organizationId: string | undefined;
  leadName: (leadId: string) => string;
  onOpenLead: (leadId: string) => void;
}) {
  const { data: tasks } = useLeadTasks(organizationId, null);
  const due = sortTasks(tasks ?? []).filter((task) => ["overdue", "due_today"].includes(taskState(task)));
  if (!due.length) return null;
  return (
    <div role="status" className="rounded-lg border border-accent/40 bg-accent/5 p-3">
      <p className="text-[13px] font-medium">
        {due.length} follow-up{due.length === 1 ? "" : "s"} due
      </p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {due.slice(0, 8).map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpenLead(task.lead_id)}
              className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[12px] hover:border-primary"
            >
              {leadName(task.lead_id)}: {task.title}
              {taskState(task) === "overdue" ? " (overdue)" : ""}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
