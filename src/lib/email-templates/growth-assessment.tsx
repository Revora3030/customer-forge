/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

/** Free Growth Assessment results — sent right after a visitor submits the form. */
interface AssessmentEmailProps {
  businessName?: string;
  score?: number;
  band?: string;
  headline?: string;
  missedRevenueMonthly?: number;
  gaps?: { title: string; fix: string }[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const AssessmentEmail = (p: AssessmentEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your Revora Growth Score: ${p.score ?? 0}/100`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Revora Growth Systems</Text>
        <Heading
          style={h1}
        >{`Your Growth Score: ${p.score ?? 0}/100 (${p.band ?? "Reviewed"})`}</Heading>
        <Text style={text}>
          Here are the results for <strong>{p.businessName || "your business"}</strong>.{" "}
          {p.headline || ""}
        </Text>
        {typeof p.missedRevenueMonthly === "number" && p.missedRevenueMonthly > 0 ? (
          <Text style={highlight}>
            Estimated revenue slipping through the gaps: {usd(p.missedRevenueMonthly)}/month (based
            on the numbers you entered — an estimate, not a guarantee).
          </Text>
        ) : null}
        <Hr style={hr} />
        <Text style={label}>What to fix first</Text>
        {(p.gaps ?? []).map((gap) => (
          <Text key={gap.title} style={text}>
            <strong>{gap.title}</strong>
            <br />
            {gap.fix}
          </Text>
        ))}
        <Hr style={hr} />
        <Text style={text}>
          Revora installs all of it for you: website, lead capture, CRM, instant quotes, booking,
          automated follow-up, reviews, local SEO and analytics.
        </Text>
        <Link href="https://revoragrowthsystems.com/get-started" style={button}>
          Start 1 day of free full access
        </Link>
        <Text style={footer}>
          $350 one-time setup, first month free, then $100/month. Cancel anytime. Questions? Reply
          to this email or call (919) 622-6620.
        </Text>
      </Container>
    </Body>
  </Html>
);

const main = { backgroundColor: "#0b0b0d", fontFamily: "Helvetica, Arial, sans-serif" };
const container = { margin: "0 auto", padding: "28px 24px", maxWidth: "560px" };
const brand = { color: "#d4af37", fontSize: "12px", letterSpacing: "2px", margin: "0 0 12px" };
const h1 = { color: "#ffffff", fontSize: "22px", lineHeight: "1.3", margin: "0 0 14px" };
const text = { color: "#c9c9d1", fontSize: "14px", lineHeight: "1.6", margin: "0 0 14px" };
const highlight = {
  color: "#f4dd8c",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 14px",
  fontWeight: 600 as const,
};
const label = { color: "#d4af37", fontSize: "12px", letterSpacing: "1.5px", margin: "0 0 10px" };
const hr = { borderColor: "#26262c", margin: "20px 0" };
const button = {
  backgroundColor: "#d4af37",
  borderRadius: "8px",
  color: "#161608",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 700 as const,
  padding: "12px 20px",
  textDecoration: "none",
};
const footer = { color: "#8a8a94", fontSize: "11px", lineHeight: "1.6", margin: "18px 0 0" };

export const template: TemplateEntry = {
  component: AssessmentEmail,
  subject: (data) => `Your Revora Growth Score: ${data["score"] ?? 0}/100`,
  displayName: "Growth assessment results",
  previewData: {
    businessName: "Northside Plumbing",
    score: 48,
    band: "Leaking",
    headline: "You are paying for attention and losing it before it becomes revenue.",
    missedRevenueMonthly: 4200,
    gaps: [{ title: "No instant quote path", fix: "An instant quote calculator." }],
  },
};
