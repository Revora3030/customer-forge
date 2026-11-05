/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
import React from "react";
import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

/**
 * Monthly value report, sent on the 1st by /api/public/jobs/monthly-report.
 * Every figure is passed in already counted from the workspace's own records;
 * this template never computes or estimates anything.
 */
interface Props {
  businessName?: string;
  monthLabel?: string;
  leads?: number;
  leadTrend?: string | null;
  won?: number;
  wonValue?: string | null;
  appointments?: number;
  visitors?: number;
  ctaClicks?: number;
  roiLine?: string | null;
  appUrl?: string;
  unsubscribeUrl?: string;
}

const APP = "https://revoragrowthsystems.com/app";

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Text style={stat}>
    <span style={statValue}>{value}</span>
    <br />
    <span style={statLabel}>{label}</span>
  </Text>
);

const MonthlyValueEmail = (p: Props) => {
  const name = p.businessName || "Your business";
  const month = p.monthLabel || "last month";
  const quiet = !p.leads && !p.appointments;
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${name} in ${month}: what Revora brought in`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>Revora Growth Systems</Text>
          <Heading style={h1}>{`${name} in ${month}`}</Heading>
          {quiet ? (
            <Text style={text}>
              No new leads or appointments came in during {month}. Your site and follow-up stayed on the whole
              month. The quickest lift is usually a fresh Google post or asking two recent customers for a review.
            </Text>
          ) : (
            <Text style={text}>
              Here is what your Revora system did for {name} in {month}
              {p.leadTrend ? ` (leads ${p.leadTrend})` : ""}.
            </Text>
          )}
          <Section>
            <Stat label="New leads" value={String(p.leads ?? 0)} />
            <Stat label="Booked or completed" value={String(p.won ?? 0)} />
            {p.wonValue ? <Stat label="Value of booked work" value={p.wonValue} /> : null}
            <Stat label="Appointments made" value={String(p.appointments ?? 0)} />
            <Stat label="Website visitors" value={String(p.visitors ?? 0)} />
            <Stat label="Button taps (call, quote, book)" value={String(p.ctaClicks ?? 0)} />
          </Section>
          {p.roiLine ? <Text style={roi}>{p.roiLine}</Text> : null}
          <Text style={note}>
            Numbers come straight from your Revora records. Booked-work value is the estimated value you set on
            each won lead, and nothing is estimated for you.
          </Text>
          <Link href={p.appUrl || APP} style={button}>
            Open my dashboard
          </Link>
          <Hr style={hr} />
          <Text style={footer}>Questions? Reply to this email or call (919) 622-6620.</Text>
          {p.unsubscribeUrl ? (
            <Text style={unsubscribe}>
              You're getting this monthly report because you run a Revora workspace. Don't want it?{" "}
              <Link href={p.unsubscribeUrl} style={unsubscribeLink}>
                Unsubscribe
              </Link>
              .
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: MonthlyValueEmail,
  subject: (data: Record<string, unknown>) =>
    (data?.["subject"] as string) ||
    `${(data?.["businessName"] as string) || "Your business"}: your ${(data?.["monthLabel"] as string) || "monthly"} report`,
  displayName: "Monthly value report",
  previewData: {
    businessName: "Elite Mobile Detailing",
    monthLabel: "Oct 2026",
    leads: 14,
    leadTrend: "up 3 from Sep 2026",
    won: 5,
    wonValue: "$2,350",
    appointments: 6,
    visitors: 412,
    ctaClicks: 37,
    roiLine: "You marked $2,350 of work as booked or completed, and Revora cost $197 this month: about 11.9× what you paid.",
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
const h1 = { margin: "0 0 18px", fontSize: "21px", lineHeight: "1.3", color: "#12131a" };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const stat = { margin: "0 0 10px", padding: "10px 14px", border: "1px solid #e7e5df", borderRadius: "10px" };
const statValue = { fontSize: "20px", fontWeight: 700, color: "#12131a" };
const statLabel = { fontSize: "13px", color: "#6b6d78" };
const roi = { ...text, fontWeight: 700, color: "#12131a" };
const note = { margin: "0 0 18px", fontSize: "13px", lineHeight: "1.5", color: "#6b6d78" };
const button = {
  display: "inline-block",
  backgroundColor: "#12131a",
  color: "#f5d67b",
  padding: "12px 22px",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
};
const hr = { borderColor: "#e7e5df", margin: "22px 0 14px" };
const footer = { margin: 0, fontSize: "13px", color: "#6b6d78" };
const unsubscribe = { margin: "12px 0 0", fontSize: "12px", color: "#8b8d96" };
const unsubscribeLink = { color: "#8b8d96", textDecoration: "underline" };
