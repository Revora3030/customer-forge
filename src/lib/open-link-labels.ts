/** Accessible names for card links on /app home so each "Open" link says where it goes. */
export function openLinkLabel(to: string, name: string, value?: string): string {
  const suffix = value ? ` (${value})` : "";
  return to === "/app/website" ? `Open website editor: ${name}${suffix}` : `Open ${name}${suffix}`;
}
