import { Buffer } from "node:buffer";
import { redactInspectionSource, safeInspectionPath } from "./builder/repository-inspection.server";

/**
 * Jarvis's view of the codebase: the whole lovable-sync tree, directory
 * browsing, path and content search, and long file reads. GitHub calls are
 * authenticated (60 unauthenticated requests an hour is what made Jarvis
 * guess paths), the tree is cached per commit, and file reads are cached per
 * commit and path, so a conversation costs a handful of requests.
 */

const REPO = "Revora3030/customer-forge";
const BRANCH = "lovable-sync";
const TREE_TTL_MS = 90_000;
export const READ_SPAN = 300;
export const LIST_PAGE = 300;

type Snapshot = { sha: string; paths: string[]; truncated: boolean; at: number };
let snapshot: Snapshot | null = null;
const fileCache = new Map<string, string>();

export class RepoError extends Error {}

function token() {
  return (process.env["REVORA_GITHUB_READ_TOKEN"] ?? process.env["REVORA_GITHUB_WRITE_TOKEN"])?.trim() || null;
}

async function github<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
  const auth = token();
  const response = await fetch(path.startsWith("https://") ? path : `https://api.github.com/repos/${REPO}/${path}`, {
    headers: {
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "revora-jarvis",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = Number(response.headers.get("x-ratelimit-reset") ?? 0);
    if ((response.status === 403 || response.status === 429) && remaining === "0") {
      const minutes = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000)) : null;
      throw new RepoError(
        `GitHub's rate limit is used up${minutes ? `; it resets in about ${minutes} minutes` : ""}.${auth ? "" : " Add REVORA_GITHUB_READ_TOKEN (or REVORA_GITHUB_WRITE_TOKEN) so Jarvis gets 5,000 requests an hour instead of 60."}`,
      );
    }
    if (response.status === 401 || response.status === 403)
      throw new RepoError("GitHub refused access. Check that REVORA_GITHUB_READ_TOKEN or REVORA_GITHUB_WRITE_TOKEN can read Revora3030/customer-forge.");
    if (response.status === 404) throw new RepoError("not_found");
    throw new RepoError(`GitHub answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

/** The current lovable-sync commit and every readable file in it. */
export async function repoSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.at < TREE_TTL_MS) return snapshot;
  const ref = await github<{ object?: { sha?: string } }>(`git/ref/heads/${BRANCH}`);
  const sha = ref.object?.sha;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw new RepoError("Couldn't read the lovable-sync revision.");
  if (snapshot && snapshot.sha === sha) {
    snapshot = { ...snapshot, at: Date.now() };
    return snapshot;
  }
  const tree = await github<{ truncated?: boolean; tree?: { path: string; type: string }[] }>(`git/trees/${sha}?recursive=1`);
  const paths = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && safeInspectionPath(entry.path))
    .map((entry) => entry.path)
    .sort();
  snapshot = { sha, paths, truncated: tree.truncated === true, at: Date.now() };
  return snapshot;
}

/** Folder → file count, two levels deep: the map Jarvis navigates by. */
export function repoMap(paths: readonly string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const path of paths) {
    const parts = path.split("/");
    const key = parts.length === 1 ? "(root)" : parts.slice(0, Math.min(2, parts.length - 1)).join("/");
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

export async function listFiles(dir: string | null, page: number) {
  const snap = await repoSnapshot();
  const prefix = dir ? `${dir.replace(/\/+$/, "")}/` : "";
  const matching = prefix ? snap.paths.filter((path) => path.startsWith(prefix)) : snap.paths;
  return {
    sha: snap.sha,
    dir: dir ?? "(all)",
    page,
    totalFiles: matching.length,
    pages: Math.max(1, Math.ceil(matching.length / LIST_PAGE)),
    paths: matching.slice((page - 1) * LIST_PAGE, page * LIST_PAGE),
    ...(prefix ? {} : { folders: repoMap(snap.paths) }),
  };
}

async function fileText(sha: string, path: string): Promise<string | null> {
  const key = `${sha}:${path}`;
  const cached = fileCache.get(key);
  if (cached !== undefined) return cached;
  const file = await github<{ encoding?: string; content?: string; size?: number }>(
    `contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${sha}`,
  );
  if (file.encoding !== "base64" || !file.content || (file.size ?? Infinity) > 400_000) return null;
  const text = redactInspectionSource(Buffer.from(file.content, "base64").toString("utf8"));
  if (fileCache.size > 80) fileCache.delete(fileCache.keys().next().value as string);
  fileCache.set(key, text);
  return text;
}

export async function readFiles(paths: readonly string[], line: number) {
  const snap = await repoSnapshot();
  const known = new Set(snap.paths);
  const files = await Promise.all(
    paths.map(async (path) => {
      if (!known.has(path)) {
        const name = path.split("/").pop()?.toLowerCase() ?? "";
        const similar = snap.paths.filter((candidate) => candidate.toLowerCase().endsWith(name)).slice(0, 5);
        return { path, status: "not_found", ...(similar.length ? { didYouMean: similar } : {}) };
      }
      try {
        const text = await fileText(snap.sha, path);
        if (text === null) return { path, status: "too_large_or_binary" };
        const lines = text.split("\n");
        const start = Math.min(Math.max(1, line), Math.max(1, lines.length));
        const end = Math.min(lines.length, start + READ_SPAN - 1);
        return {
          path,
          status: "read",
          startLine: start,
          endLine: end,
          totalLines: lines.length,
          ...(end < lines.length ? { more: `continue with line ${end + 1}` } : {}),
          source: lines.slice(start - 1, end).map((text, index) => `${start + index}: ${text}`).join("\n"),
        };
      } catch (error) {
        return { path, status: "not_read", reason: error instanceof Error ? error.message : "failed" };
      }
    }),
  );
  return { sha: snap.sha, files };
}

/**
 * Finds files by path, then by content through GitHub code search (which
 * indexes the default branch, lovable-sync). Path matches always work; content
 * matches need a token and may lag a fresh push by a few minutes.
 */
export async function searchCode(query: string) {
  const snap = await repoSnapshot();
  const needle = query.toLowerCase();
  const pathMatches = snap.paths.filter((path) => path.toLowerCase().includes(needle)).slice(0, 40);
  let contentMatches: { path: string; fragments: string[] }[] = [];
  let contentSearch = "searched";
  if (!token()) contentSearch = "skipped: needs a GitHub token";
  else {
    try {
      const q = encodeURIComponent(`${query} repo:${REPO}`);
      const result = await github<{ items?: { path: string; text_matches?: { fragment?: string }[] }[] }>(
        `https://api.github.com/search/code?q=${q}&per_page=25`,
        "application/vnd.github.text-match+json",
      );
      contentMatches = (result.items ?? [])
        .filter((item) => safeInspectionPath(item.path))
        .map((item) => ({
          path: item.path,
          fragments: (item.text_matches ?? [])
            .map((match) => redactInspectionSource(String(match.fragment ?? "")).slice(0, 300))
            .filter(Boolean)
            .slice(0, 2),
        }));
    } catch (error) {
      contentSearch = `unavailable: ${error instanceof Error ? error.message : "failed"}`;
    }
  }
  return { sha: snap.sha, query, pathMatches, contentMatches, contentSearch };
}
