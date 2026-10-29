import { mergedMailingAddress } from "./gmail/stored-config.server";
import { OUTREACH_PROMOTIONAL_NOTICE } from "./outreach-notice";

/**
 * Sender block every outreach draft ends with: the promotional notice, name,
 * physical address and an opt-out line. Emails Revora actually sends pass
 * `unsubscribeUrl`, so the opt-out is a one-click link rather than a reply
 * (they come from noreply@).
 */
export function outreachFooter(options: { unsubscribeUrl?: string } = {}): {
  address: string;
  footer: string;
  /** Notice, sender, company and address lines, without the separator or opt-out line. */
  senderLines: string[];
} {
  const address = mergedMailingAddress();
  const sender = process.env["REVORA_SENDER_NAME"]?.trim() || "Revora Growth Systems";
  const senderLines = [
    OUTREACH_PROMOTIONAL_NOTICE,
    sender,
    "Revora Growth Systems",
    address || "[ADD YOUR PHYSICAL MAILING ADDRESS BEFORE SENDING]",
  ];
  const footer = [
    "",
    "--",
    ...senderLines,
    options.unsubscribeUrl
      ? `Not interested? Unsubscribe and we won't contact you again: ${options.unsubscribeUrl}`
      : "Not interested? Reply \"no thanks\" and I won't contact you again.",
  ].join("\n");
  return { address, footer, senderLines };
}
