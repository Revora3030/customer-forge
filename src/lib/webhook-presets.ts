/**
 * B13-8 webhook presets: copy-paste setup for the owner's OWN Zapier, Make or
 * HighLevel account, plus the sample body Revora sends. Pure, browser-safe.
 *
 * Revora has no paid integration with these tools; the owner connects their
 * own account by pasting the URL the tool gives them into "Lead webhook".
 */

export type WebhookPresetId = "zapier" | "make" | "highlevel";

export type WebhookPreset = {
  id: WebhookPresetId;
  name: string;
  /** Where the URL the owner pastes usually starts, used only as an input hint. */
  urlHint: string;
  steps: string[];
  /** Fields to map in the tool, by their path in the JSON body. */
  mapping: { field: string; path: string }[];
  note: string;
};

const COMMON_MAPPING = [
  { field: "Name", path: "lead.name" },
  { field: "Email", path: "lead.email" },
  { field: "Phone", path: "lead.phone" },
  { field: "Service", path: "lead.service" },
  { field: "Message", path: "lead.message" },
  { field: "Lead ID (to avoid duplicates)", path: "lead.lead_id" },
];

export const WEBHOOK_PRESETS: readonly WebhookPreset[] = [
  {
    id: "zapier",
    name: "Zapier",
    urlHint: "https://hooks.zapier.com/hooks/catch/...",
    steps: [
      "In Zapier, create a Zap. For the trigger choose Webhooks by Zapier, event Catch Hook.",
      "Copy the webhook URL Zapier shows and paste it into Lead webhook above, then Save.",
      "Press Send test webhook below so Zapier sees a sample, then map the fields in your next step.",
    ],
    mapping: COMMON_MAPPING,
    note: "Webhooks by Zapier may need a paid Zapier plan. Check your plan in Zapier.",
  },
  {
    id: "make",
    name: "Make",
    urlHint: "https://hook.us1.make.com/...",
    steps: [
      "In Make, create a scenario. Add the Webhooks module, Custom webhook, and click Add to create one.",
      "Copy the address Make gives you and paste it into Lead webhook above, then Save.",
      "In Make click Redetermine data structure (or Run once), then press Send test webhook below.",
    ],
    mapping: COMMON_MAPPING,
    note: "Make reads the field names from the test, so send one before you map fields.",
  },
  {
    id: "highlevel",
    name: "HighLevel",
    urlHint: "https://services.leadconnectorhq.com/hooks/...",
    steps: [
      "In HighLevel, open Automation, create a workflow and add the trigger Inbound Webhook.",
      "Copy the webhook URL HighLevel shows and paste it into Lead webhook above, then Save.",
      "Press Send test webhook below, then in HighLevel pick that test as the mapping reference and add a Create/Update Contact action.",
    ],
    mapping: COMMON_MAPPING,
    note: "Inbound Webhook can be a premium workflow trigger in HighLevel. Check your HighLevel plan.",
  },
] as const;

export function webhookPreset(id: string): WebhookPreset | undefined {
  return WEBHOOK_PRESETS.find((preset) => preset.id === id);
}

/** Lead ID used in every test delivery: never a real lead row, never counted. */
export const TEST_WEBHOOK_LEAD_ID = "00000000-0000-4000-8000-000000000000";

/**
 * The body a test (and the sample shown on screen) carries. Same shape as a
 * real `lead.created` delivery, plus `test: true`; contact fields use reserved
 * example values (example.com, 555-01xx) so nothing reaches a real person.
 */
export function sampleLeadWebhookBody(organizationId: string, now: Date = new Date()) {
  return {
    event: "lead.created" as const,
    timestamp: now.toISOString(),
    workspace_id: organizationId,
    organization_id: organizationId,
    idempotency_key: `lead.created:test:${now.getTime()}`,
    test: true as const,
    lead: {
      lead_id: TEST_WEBHOOK_LEAD_ID,
      name: "TEST LEAD (sample, not a real customer)",
      email: "test.lead@example.com",
      phone: "(555) 010-0199",
      service: "Sample service",
      message: "Test delivery from Revora. Not a real customer; safe to ignore or delete.",
      source_url: "revora:webhook-test",
    },
  };
}

/** Plain words for the webhook failure codes the dispatcher returns. */
export function webhookTestFailureText(reason: string | null, statusCode: number | null): string {
  if (statusCode) return `Your webhook answered HTTP ${statusCode}.`;
  switch (reason) {
    case "timeout":
      return "Your webhook did not answer within 5 seconds.";
    case "invalid_webhook_url":
      return "The saved webhook address is not a valid https URL.";
    case "unsafe_webhook_target":
      return "The saved webhook address points somewhere we can't send to.";
    default:
      return "Your webhook could not be reached.";
  }
}
