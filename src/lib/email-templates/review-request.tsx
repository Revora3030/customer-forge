/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
import React from "react";
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

/**
 * Post-job review request (review-sequence.ts). Each star links to the
 * customer's private feedback page with that rating preselected; opening the
 * link records nothing — the customer confirms on the page — so inbox link
 * scanners can't submit a rating.
 */
interface Props {
  businessName?: string;
  heading?: string;
  message?: string;
  feedbackUrl?: string;
}

const STARS = [1, 2, 3, 4, 5] as const;

const Email = ({ businessName, heading, message, feedbackUrl }: Props) => {
  // The link is shown as stars below, so drop the bare URL line from the copy.
  const copy = (message ?? "").replace(/\s*https:\/\/\S+\s*$/, "").trim();
  const paragraphs = copy.split(/\n{2,}/).filter(Boolean);
  const business = businessName || "Your local team";
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading || `How did ${business} do?`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>{business}</Text>
          <Heading style={h1}>{heading || "How did we do?"}</Heading>
          <Section>
            {paragraphs.map((p, i) => (
              <Text key={i} style={text}>
                {p}
              </Text>
            ))}
          </Section>
          {feedbackUrl ? (
            <Section style={starRow}>
              {STARS.map((n) => (
                <Link key={n} href={`${feedbackUrl}?rating=${n}`} style={star} aria-label={`${n} star${n === 1 ? "" : "s"}`}>
                  {"★".repeat(n)}
                </Link>
              ))}
              <Text style={hint}>Tap the number of stars that fits your visit.</Text>
            </Section>
          ) : null}
          <Hr style={hr} />
          <Text style={footer}>— {business}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    (data?.["heading"] as string) || `How did ${(data?.["businessName"] as string) || "we"} do?`,
  displayName: "Post-job review request",
  previewData: {
    businessName: "Elite Mobile Detailing",
    heading: "How did we do, Jordan?",
    message:
      "Hi Jordan, thanks for choosing Elite Mobile Detailing. How did we do? Tap a star to rate your visit. It takes 10 seconds.\n\nhttps://revoragrowthsystems.com/feedback/preview_token_preview_token_00",
    feedbackUrl: "https://revoragrowthsystems.com/feedback/preview_token_preview_token_00",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "32px 28px", maxWidth: "560px" };
const brand = {
  margin: "0 0 8px",
  fontSize: "12px",
  letterSpacing: "1.5px",
  textTransform: "uppercase" as const,
  color: "#8a6a1f",
  fontWeight: 700,
};
const h1 = { margin: "0 0 16px", fontSize: "22px", lineHeight: "1.3", color: "#12131a" };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const starRow = { margin: "8px 0 4px" };
const star = {
  display: "block",
  margin: "0 0 8px",
  padding: "10px 14px",
  border: "1px solid #e7e5df",
  borderRadius: "8px",
  color: "#c08a12",
  fontSize: "20px",
  letterSpacing: "2px",
  textDecoration: "none",
};
const hint = { margin: "4px 0 0", fontSize: "13px", color: "#6b6d78" };
const hr = { borderColor: "#e7e5df", margin: "24px 0 16px" };
const footer = { margin: 0, fontSize: "13px", color: "#6b6d78" };
