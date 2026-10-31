import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_DOCUMENT_JSON,
  cleanSignerName,
  isMissingSchema,
  sha256Hex,
  signaturePngBytes,
} from "@/lib/estimates/estimate-signature";

export type SaveSignatureResult =
  | { ok: true; id: string; documentSha256: string }
  | { ok: false; pendingMigration: boolean; message: string; documentSha256: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function edgeIp(): string | null {
  try {
    const headers = getRequest().headers;
    return headers.get("cf-connecting-ip")?.trim() || headers.get("true-client-ip")?.trim() || null;
  } catch {
    return null;
  }
}

function userAgent(): string | null {
  try {
    return getRequest().headers.get("user-agent")?.slice(0, 300) || null;
  } catch {
    return null;
  }
}

/**
 * Records a customer's on-screen "Sign & approve" for an estimate the owner
 * prepared: PNG to private storage plus an audit row (signer, time, IP hash,
 * SHA-256 of the exact estimate JSON). Staff+ only, scoped to the workspace.
 */
export const saveEstimateSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      leadId?: string | null;
      documentNumber: string;
      documentJson: string;
      signerName: string;
      signaturePng: string;
    }) => {
      const organizationId = String(input?.organizationId ?? "");
      if (!UUID.test(organizationId)) throw new Error("Choose a workspace first.");
      const leadId = input?.leadId && UUID.test(String(input.leadId)) ? String(input.leadId) : null;
      const documentNumber = String(input?.documentNumber ?? "").trim().slice(0, 60);
      if (!documentNumber) throw new Error("The estimate has no number.");
      const documentJson = String(input?.documentJson ?? "");
      if (!documentJson || documentJson.length > MAX_DOCUMENT_JSON) throw new Error("The estimate is too large to sign.");
      let parsed: { kind?: unknown; totalCents?: unknown };
      try {
        parsed = JSON.parse(documentJson) as typeof parsed;
      } catch {
        throw new Error("The estimate couldn't be read.");
      }
      if (parsed.kind !== "estimate") throw new Error("Only estimates can be signed.");
      const signerName = cleanSignerName(input?.signerName);
      if (!signerName) throw new Error("Type the customer's name before they sign.");
      const signaturePng = String(input?.signaturePng ?? "");
      if (!signaturePngBytes(signaturePng)) throw new Error("The signature couldn't be read. Clear it and sign again.");
      return { organizationId, leadId, documentNumber, documentJson, signerName, signaturePng, parsed };
    },
  )
  .handler(async ({ data, context }): Promise<SaveSignatureResult> => {
    const { requireOrgRole } = await import("@/lib/org-authz.server");
    await requireOrgRole(context.supabase, data.organizationId, context.userId, "staff");
    const documentSha256 = await sha256Hex(data.documentJson);
    const png = signaturePngBytes(data.signaturePng)!;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The table isn't in the generated types until Lovable applies the migration.
    const admin = supabaseAdmin as unknown as {
      storage: typeof supabaseAdmin.storage;
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { message: string; code?: string } | null }>;
          };
        };
      };
    };

    const ip = edgeIp();
    const { estimateSignatureIpSalt } = await import("./signature-salt.server");
    const salt = estimateSignatureIpSalt();
    const ipHash = ip && salt ? await sha256Hex(`estimate-signature-ip|${salt}|${ip}`) : null;
    const path = `${data.organizationId}/${crypto.randomUUID()}.png`;

    const uploaded = await admin.storage
      .from("estimate-signatures")
      .upload(path, png, { contentType: "image/png", upsert: false });
    if (uploaded.error) {
      const pending = isMissingSchema(uploaded.error.message);
      if (!pending) console.warn("estimate signature upload failed", uploaded.error.message);
      return {
        ok: false,
        pendingMigration: pending,
        documentSha256,
        message: pending
          ? "Signed on this copy. The signature audit record isn't switched on yet (database update pending)."
          : "Signed on this copy, but the audit record couldn't be saved. Try again.",
      };
    }

    const totalCents = typeof data.parsed.totalCents === "number" ? Math.round(data.parsed.totalCents) : null;
    const { data: row, error } = await admin
      .from("estimate_signatures")
      .insert({
        organization_id: data.organizationId,
        lead_id: data.leadId,
        document_kind: "estimate",
        document_number: data.documentNumber,
        document_sha256: documentSha256,
        document_json: JSON.parse(data.documentJson) as unknown,
        total_cents: totalCents,
        signer_name: data.signerName,
        ip_hash: ipHash,
        user_agent: userAgent(),
        storage_path: path,
        recorded_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !row) {
      await admin.storage.from("estimate-signatures").remove([path]).catch(() => undefined);
      const pending = isMissingSchema(error?.message, error?.code ?? null);
      if (!pending) console.warn("estimate signature insert failed", error?.message);
      return {
        ok: false,
        pendingMigration: pending,
        documentSha256,
        message: pending
          ? "Signed on this copy. The signature audit record isn't switched on yet (database update pending)."
          : "Signed on this copy, but the audit record couldn't be saved. Try again.",
      };
    }
    return { ok: true, id: row.id, documentSha256 };
  });
