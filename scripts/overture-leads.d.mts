export const CSV_HEADER: string[];
export const MAX_LIMIT: number;
export type OvertureArgs = {
  city: string; state: string; trade: string[]; limit: number; minConfidence: number;
  bbox: number[] | null; release: string | null; anyCity: boolean; listCategories: boolean; out: string;
};
export function parseArgs(argv: string[]): OvertureArgs;
export function latestRelease(listingXml: string): string;
export function placeFileNames(listingXml: string): string[];
export function rowGroupMayOverlap(
  rowGroup: { columns: { meta_data: { path_in_schema: string[]; statistics?: { min: number; max: number } } }[] },
  box: { west: number; south: number; east: number; north: number },
): boolean;
export function humanize(category: unknown): string;
export function categoryOf(place: Record<string, unknown>): { primary: string; path: string[] };
export function matchesTrade(place: Record<string, unknown>, keywords: string[]): boolean;
export function leadRow(
  place: Record<string, unknown>,
  context: { release: string; city: string; anyCity: boolean; minConfidence: number; today: string },
): { key: string; confidence: number; cells: string[] } | null;
export function csvCell(value: unknown): string;
export function toCsv(rows: string[][]): string;
export function cityBox(city: string, state: string): Promise<{ west: number; south: number; east: number; north: number }>;
export function readPlaces(options: { release: string; box: { west: number; south: number; east: number; north: number }; onProgress?: (progress: { files: number; rowGroups: number; rowGroupsRead: number }) => void }): Promise<Record<string, unknown>[]>;
export function main(argv: string[]): Promise<void>;
