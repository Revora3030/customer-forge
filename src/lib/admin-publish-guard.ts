/**
 * Guard for the admin "Published" switch (`setClientPublishState`).
 *
 * That switch flips `website_settings.publish_state` without running the normal
 * publish path, so on its own it can mark an empty workspace as live and
 * visitors get the "This website is being updated" shell. Before an admin may
 * mark a site published, the workspace must have a saved production snapshot
 * (`website_versions`) and at least one visible section. Any other state
 * (draft, preview, unpublished) is always allowed.
 *
 * Messages are short, plain copy so `friendlyError` shows them in the admin UI.
 */

export const NO_VERSION_MESSAGE =
  "This site can't be marked published: it has no saved published version yet. Publish it from the builder first.";
export const NO_SECTIONS_MESSAGE =
  "This site can't be marked published: it has no visible sections yet. Build the website before publishing it.";
export const CHECK_FAILED_MESSAGE =
  "We couldn't check this site's content, so its publishing state was not changed. Try again.";

type CountResult = { count: number | null; error: unknown };
type CountQuery = PromiseLike<CountResult> & {
  eq: (column: string, value: unknown) => CountQuery;
};
export type PublishGuardClient = {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact"; head: true }) => CountQuery;
  };
};

export async function assertCanSetPublishState(
  client: PublishGuardClient,
  organizationId: string,
  state: string,
): Promise<void> {
  if (state !== "published") return;

  const [versions, sections] = await Promise.all([
    client
      .from("website_versions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    client
      .from("website_sections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_visible", true),
  ]);

  if (versions.error || sections.error) throw new Error(CHECK_FAILED_MESSAGE);
  if (!versions.count) throw new Error(NO_VERSION_MESSAGE);
  if (!sections.count) throw new Error(NO_SECTIONS_MESSAGE);
}
