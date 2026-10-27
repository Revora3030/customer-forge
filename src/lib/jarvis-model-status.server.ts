/** Whether Lovable AI has its key. Boolean only; the value never leaves the server. */
export function configuredProviders(env: Readonly<Record<string, string | undefined>>): Record<string, boolean> {
  return { lovable: Boolean(env["LOVABLE_API_KEY"]?.trim()) };
}
