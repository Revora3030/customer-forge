import Stripe from "stripe";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

/**
 * Resolve the public webhook environment. Production is the default because
 * Stripe dashboard webhook URLs are concrete HTTPS endpoints and should not
 * require a query string. Sandbox must remain explicit.
 */
export function resolveStripeWebhookEnv(rawEnv: string | null): StripeEnv {
  if (rawEnv === null || rawEnv === "" || rawEnv === "live") return "live";
  if (rawEnv === "sandbox") return "sandbox";
  throw new Error("Invalid webhook environment");
}

/**
 * The app is bound to ONE connected Stripe account (bring-your-own key). Both
 * environment names are kept for database/subscription compatibility, but every
 * Stripe call goes to the same connected account via STRIPE_SECRET_KEY.
 */
export function getConnectionApiKey(_env: StripeEnv): string {
  return getEnv("STRIPE_SECRET_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const secretKey = getConnectionApiKey(env);

  return new Stripe(secretKey, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const stripeError = error as {
      message?: string;
      type?: string;
      code?: string;
      decline_code?: string;
      param?: string;
      requestId?: string;
      raw?: {
        message?: string;
        type?: string;
        code?: string;
        decline_code?: string;
        param?: string;
        requestId?: string;
      };
    };

    const message = stripeError.raw?.message ?? stripeError.message;
    if (message) {
      const details = [
        stripeError.raw?.type ?? stripeError.type,
        stripeError.raw?.code ?? stripeError.code,
        stripeError.raw?.decline_code ?? stripeError.decline_code,
        stripeError.raw?.param ?? stripeError.param,
        stripeError.raw?.requestId ?? stripeError.requestId,
      ].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }

  return "Stripe request failed";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
  // Stripe delivers arbitrary JSON per event type; the shape is narrowed by
  // the individual handlers, so the raw envelope stays permissive here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ type: string; id?: string; livemode?: boolean; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1" && value) v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw new Error("Invalid signature timestamp");
  const age = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (age > 300) throw new Error("Webhook timestamp too old");

  const candidateSecrets =
    env === "sandbox"
      ? [
          process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"],
          process.env["STRIPE_SANDBOX_WEBHOOK_SECRET"],
        ].filter(Boolean) as string[]
      : [
          process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"],
          process.env["Stripelivewebhook"],
          process.env["STRIPE_WEBHOOK_SECRET"],
          process.env["STRIPE_LIVE_WEBHOOK_SECRET"],
        ].filter(Boolean) as string[];

  if (candidateSecrets.length === 0) {
    throw new Error("Webhook secret is not configured for environment: " + env);
  }

  const payloadToSign = new TextEncoder().encode(timestamp + "." + body);

  for (const secret of candidateSecrets) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );

      for (const candidate of v1Signatures) {
        try {
          const expected = Uint8Array.from(
            candidate.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
          );
          if (expected.length !== 32) continue;
          if (await crypto.subtle.verify("HMAC", key, expected, payloadToSign)) {
            return JSON.parse(body);
          }
        } catch {
          // Continue through every signature and candidate secret.
        }
      }
    } catch {
      // Continue to the next candidate secret.
    }
  }

  throw new Error("Invalid webhook signature");
}
