export const WORKSPACE_SLUG_RULE =
  "Use lowercase letters, numbers and single hyphens only (for example: smith-plumbing).";

/** Lowercase letters and digits, with single hyphens between them. */
export function isValidWorkspaceSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
