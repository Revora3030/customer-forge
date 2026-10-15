/** Repository paths Jarvis and the builder may read. Browser-safe. */
export function safeInspectionPath(path: string): boolean {
  if (path.length > 240 || /[\\%?#]/.test(path) || path.split("").some((character) => character.charCodeAt(0) === 0)) return false;
  if (path.split("/").some((part) => part === ".." || part === ".")) return false;
  if (/(^|\/)(\.env[^/]*|node_modules|\.git)(\/|$)/i.test(path)) return false;
  return /^(src\/|scripts\/|docs\/|supabase\/migrations\/|\.github\/workflows\/)/.test(path) && /\.(ts|tsx|js|mjs|css|md|json|sql|yml|yaml)$/.test(path) && !/routeTree\.gen|supabase\/types/.test(path);
}
