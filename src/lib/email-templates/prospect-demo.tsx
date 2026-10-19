/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
import React from "react";
import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { OUTREACH_PROMOTIONAL_NOTICE } from "@/lib/outreach-notice";

interface Props {
  subject?: string;
  message?: string;
  /** Sender name, company and physical mailing address, one per line (CAN-SPAM). */
  footerLines?: string[];
  unsubscribeUrl?: string;
}

/**
 * First-touch email to a business Jarvis built a demo website for. Plain and
 * personal: the operator-reviewed (or AI-drafted) text, then the promotional
 * notice, the sender block and a one-click unsubscribe link, always present.
 */
const Email = ({ subject, message, footerLines, unsubscribeUrl }: Props) => {
  const paragraphs = (message ?? "").split(/\n{2,}/).filter(Boolean);
  // The ad notice is rendered by the template itself, whatever the caller passes.
  const closingLines = [OUTREACH_PROMOTIONAL_NOTICE, ...(footerLines ?? []).filter((line) => line !== OUTREACH_PROMOTIONAL_NOTICE)];
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject || "A free website draft for your business"}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={text}>
                {p.split("\n").map((line, j, lines) => (
                  <React.Fragment key={j}>
                    {line}
                    {j < lines.length - 1 ? <br /> : null}
                  </React.Fragment>
                ))}
              </Text>
            ))}
          </Section>
          <Hr style={hr} />
          {closingLines.map((line, i) => (
            <Text key={i} style={footer}>
              {line}
            </Text>
          ))}
          {unsubscribeUrl ? (
            <Text style={footer}>
              Not interested? <Link href={unsubscribeUrl} style={link}>Unsubscribe</Link> and we won't contact you again: {unsubscribeUrl}
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    (typeof data?.["subject"] === "string" && data["subject"]) || "A free website draft for your business",
  displayName: "Prospect demo website",
  previewData: {
    subject: "A free website draft for Elite Mobile Detailing",
    message:
      "Hi Elite Mobile Detailing team,\n\nI couldn't find a website for your business, so I put together a free draft from your public details:\nhttps://revoragrowthsystems.com/p/example\n\nIt's private and nothing is published.",
    footerLines: ["Revora Growth Systems", "123 Main St, Raleigh, NC 27601"],
    unsubscribeUrl: "https://revoragrowthsystems.com/unsubscribe/outreach/example",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "32px 28px", maxWidth: "560px" };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const hr = { borderColor: "#e7e5df", margin: "24px 0 16px" };
const footer = { margin: "0 0 4px", fontSize: "12px", lineHeight: "1.5", color: "#6b6d78" };
const link = { color: "#6b6d78", textDecoration: "underline" };
