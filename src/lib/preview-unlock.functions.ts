import { createServerFn } from "@tanstack/react-start";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,}$/;

/**
 * A visitor types the password for a shared preview link. On success an
 * HttpOnly cookie remembers it for this link in this browser; nothing about the
 * link is returned either way. A wrong password, an unknown link and an
 * unprotected link all answer the same.
 */
export const unlockPreview = createServerFn({ method: "POST" })
  .validator((input: { token: string; password: string }) => ({
    token: String(input?.token ?? "").trim().slice(0, 120),
    password: typeof input?.password === "string" ? input.password.slice(0, 200) : "",
  }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; reason: "wrong_password" | "rate_limited" }> => {
    const { attemptUnlock, clientIp } = await import("@/lib/preview-password.server");
    if (!TOKEN_RE.test(data.token)) return { ok: false, reason: "wrong_password" };
    const { getRequest } = await import("@tanstack/react-start/server");
    return attemptUnlock(data, { ip: clientIp(getRequest().headers) });
  });
