/** Repository paths Jarvis and the builder may read. Browser-safe. */
export function safeInspectionPath(path: string): boolean {
  if (path.length > 240 || /[\\%?#]/.test(path) || path.split("").some((character) => character.charCodeAt(0) === 0)) return false;
  if (path.split("/").some((part) => part === ".." || part === ".")) return false;
  if (/(^|\/)(\.env[^/]*|node_modules|\.git)(\/|$)/i.test(path)) return false;
  // Root project files (package.json, configs, AGENTS.md…) are readable so a
  // super admin's Jarvis can see the whole project, not only src/.
  const rootFile = /^[A-Za-z0-9_.-]+\.(json|ts|js|mjs|md|toml)$/.test(path) && !/^(bun\.lock|package-lock\.json)$/.test(path);
  return (rootFile || /^(src\/|scripts\/|docs\/|cloudflare\/|drizzle\/|security\/|supabase\/migrations\/|supabase\/config\.toml$|\.github\/workflows\/)/.test(path)) && /\.(ts|tsx|js|mjs|css|md|json|sql|yml|yaml|toml)$/.test(path) && !/routeTree\.gen|supabase\/types/.test(path);
}
