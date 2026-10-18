/**
 * One server-side definition of a quote calculator that can actually work.
 *
 * An active quote form only helps a visitor when it has at least one question
 * with at least one option to pick: the public calculator keeps its submit
 * button disabled until every question is answered, so a form with no
 * questions (or only option-less ones) renders a dead widget. The build, the
 * quality audit and the brief all count only usable forms, so the AI never
 * plans a quote section or primary call to action around an empty form.
 *
 * Read-only. Every query is scoped to the workspace.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = { from: SupabaseClient["from"] };

type IdRow = { id: string };
type QuestionRow = { id: string; form_id: string };
type OptionRow = { question_id: string };

/**
 * Ids of the workspace's active quote forms that have at least one question
 * with at least one option. Throws when a read fails, so callers fail closed
 * instead of treating a database error as "no calculator".
 */
export async function usableQuoteFormIds(db: Db, orgId: string): Promise<string[]> {
  const forms = await db
    .from("quote_forms")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  if (forms.error) throw new Error(`Couldn't read the quote forms: ${forms.error.message}`);
  const formIds = ((forms.data ?? []) as IdRow[]).map((row) => row.id).filter(Boolean);
  if (!formIds.length) return [];

  const questions = await db
    .from("quote_questions")
    .select("id, form_id")
    .eq("organization_id", orgId)
    .in("form_id", formIds);
  if (questions.error) throw new Error(`Couldn't read the quote questions: ${questions.error.message}`);
  const questionRows = (questions.data ?? []) as QuestionRow[];
  if (!questionRows.length) return [];

  const options = await db
    .from("quote_options")
    .select("question_id")
    .eq("organization_id", orgId)
    .in(
      "question_id",
      questionRows.map((row) => row.id),
    );
  if (options.error) throw new Error(`Couldn't read the quote options: ${options.error.message}`);
  const answerable = new Set(((options.data ?? []) as OptionRow[]).map((row) => row.question_id));

  // Questions without options are dropped; a form needs one answerable question.
  const usable = new Set(
    questionRows.filter((row) => answerable.has(row.id)).map((row) => row.form_id),
  );
  return formIds.filter((id) => usable.has(id));
}
