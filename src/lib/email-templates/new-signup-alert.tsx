import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  email?: string;
  signedUpAt?: string;
  landingPath?: string;
  referrer?: string;
  utmSource?: string;
  utmCampaign?: string;
}

const rowsOf = (p: Props) =>
  [
    ["Email", p.email],
    ["Signed up", p.signedUpAt],
    ["Landing page", p.landingPath],
    ["Referrer", p.referrer],
    ["Ad source", p.utmSource],
    ["Campaign", p.utmCampaign],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New Revora signup: ${props.email || "a new customer"}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Revora Growth Systems</Text>
        <Heading style={h1}>New customer signup</Heading>
        <Text style={text}>Someone just created a Revora account.</Text>
        {rowsOf(props).map(([label, value]) => (
          <Row key={label} style={row}>
            <Column style={labelCol}>{label}</Column>
            <Column style={valueCol}>{value}</Column>
          </Row>
        ))}
        <Hr style={hr} />
        <Text style={footer}>
          Open your admin dashboard to see their workspace and trial progress.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    `New Revora signup: ${(data?.["email"] as string) || "new customer"}`,
  displayName: "New signup alert (owner)",
  // Owner notification — always goes to the platform owner.
  to: "revorabusiness0@gmail.com",
  previewData: {
    email: "jordan@example.com",
    signedUpAt: "Sep 25, 2026, 6:37 PM UTC",
    landingPath: "/get-started",
    utmSource: "google",
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
const h1 = { margin: "0 0 10px", fontSize: "21px", lineHeight: "1.3", color: "#12131a" };
const text = { margin: "0 0 16px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const row = { marginBottom: "6px" };
const labelCol = { width: "130px", fontSize: "13px", color: "#6b6d78" };
const valueCol = { fontSize: "14px", color: "#12131a", fontWeight: 600 };
const hr = { borderColor: "#e7e5df", margin: "20px 0 14px" };
const footer = { margin: 0, fontSize: "13px", color: "#6b6d78" };
