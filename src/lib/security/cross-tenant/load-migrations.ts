import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRlsModel, type RlsModel } from "./rls-model";

export const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

export function loadMigrationFiles(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(resolve(dir, name), "utf8") }));
}

let cached: RlsModel | null = null;
export function loadRlsModel(): RlsModel {
  cached ??= buildRlsModel(loadMigrationFiles());
  return cached;
}
