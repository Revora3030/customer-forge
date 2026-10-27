/** Per-mounted-form interaction deduplication. Preview interactions never
 * become visitor events; remounting a different form starts a new lifecycle. */
export function shouldTrackFormEvent(seen: Set<string>, event: string, preview: boolean): boolean {
  if (preview || seen.has(event)) return false;
  seen.add(event);
  return true;
}