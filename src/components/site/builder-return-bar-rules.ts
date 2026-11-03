/**
 * When the floating "Builder" shortcut may appear on a generated site. Kept as
 * one pure function so the rule is tested without a browser:
 *  - only inside the owner's private draft preview, never on a public /s/ page
 *    (or any path a visitor can open),
 *  - never on a phone-width screen, where it covered the site and its Call/Book bar,
 *  - never inside the builder's own preview frame (the builder is already there),
 *  - only to a signed-in owner or admin of THAT site's workspace.
 */
export const BUILDER_SHORTCUT_MIN_WIDTH = 768;
export const BUILDER_SHORTCUT_ROLES: readonly string[] = ["owner", "admin"];

export function isPublicSitePath(pathname: string): boolean {
  return /^\/s(\/|$)/.test(pathname);
}

export function canShowBuilderShortcut(input: {
  signedIn: boolean;
  /** Role of the signed-in user in this site's workspace; null when not a member. */
  role: string | null;
  framed: boolean;
  dismissed: boolean;
  viewportWidth: number;
  pathname: string;
}): boolean {
  if (!input.signedIn || input.framed || input.dismissed) return false;
  if (input.viewportWidth < BUILDER_SHORTCUT_MIN_WIDTH) return false;
  if (isPublicSitePath(input.pathname)) return false;
  return input.role != null && BUILDER_SHORTCUT_ROLES.includes(input.role);
}
