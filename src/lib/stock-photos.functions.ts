/**
 * Free stock photo sourcing, server side.
 *
 * Search runs against Openverse, an openly licensed image index that needs no
 * API key and costs nothing. Only licences that allow commercial use survive
 * (see `stock-photos.ts`), and every saved picture carries its licence, licence
 * link, creator and required credit line into the workspace photo library.
 *
 * Failure is reported honestly: if the library cannot be reached the caller is
 * told so, and nothing is invented or cached as if it had worked.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildStockQuery,
  normaliseStockResults,
  stockMediaRow,
  type StockPhoto,
} from "@/lib/builder/stock-photos";

const ENDPOINT = "https://api.openverse.org/v1/images/";
const PAGE_SIZE = 12;
const TIMEOUT_MS = 12_000;

const uuid = (value: unknown): string => {
  const text = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error("A workspace id is required.");
  }
  return text;
};

const trimmed = (value: unknown, limit: number): string =>
  String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

export type StockSearchResult = {
  photos: StockPhoto[];
  query: string;
  /** Present only when the search could not be completed. */
  error: string | null;
};

export const searchStockPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { topic: string; industry?: string | null; page?: number }) => ({
    topic: trimmed(data.topic, 120),
    industry: data.industry ? trimmed(data.industry, 60) : null,
    page: Math.min(Math.max(Math.trunc(Number(data.page ?? 1)) || 1, 1), 10),
  }))
  .handler(async ({ data }): Promise<StockSearchResult> => {
    const query = buildStockQuery(data.topic, data.industry);
    if (!query) return { photos: [], query: "", error: "Type what the picture should show." };

    const url = new URL(ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("page", String(data.page));
    url.searchParams.set("license_type", "commercial,modification");
    url.searchParams.set("mature", "false");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "Revora-Growth-Systems/1.0" },
      });
      if (!response.ok) {
        return {
          photos: [],
          query,
          error: `The photo library did not answer (${response.status}). Nothing was changed.`,
        };
      }
      const body = (await response.json()) as unknown;
      return { photos: normaliseStockResults(body), query, error: null };
    } catch {
      return { photos: [], query, error: "The photo library could not be reached just now." };
    } finally {
      clearTimeout(timer);
    }
  });

export const saveStockPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { organizationId: string; photo: StockPhoto; altText?: string | null }) => {
    const photo = data.photo;
    if (!photo || typeof photo !== "object") throw new Error("Choose a picture first.");
    if (!/^https:\/\//i.test(String(photo.url ?? ""))) throw new Error("That picture address is not usable.");
    if (!String(photo.licenseCode ?? "").trim()) throw new Error("That picture has no licence recorded.");
    return {
      organizationId: uuid(data.organizationId),
      photo,
      altText: data.altText ? trimmed(data.altText, 200) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const row = stockMediaRow(data.photo, data.altText);
    const { data: saved, error } = await context.supabase
      .from("media")
      .insert({ organization_id: data.organizationId, ...row })
      .select("id")
      .single();

    if (error) {
      const message = /row-level security|permission|forbidden/i.test(error.message)
        ? "You do not have permission to add photos to this website."
        : "The picture could not be saved. Nothing was changed.";
      throw new Error(message);
    }

    return { id: saved.id as string, licence: row.license, attribution: row.attribution };
  });
