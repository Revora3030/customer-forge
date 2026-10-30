/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
import React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { PLATFORM_OWNER_EMAIL } from "@/lib/platform-owner";

interface Props {
  title?: string;
  summary?: string;
  rows?: [string, string][];
  link?: string;
}

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{props.title || "Revora alert"}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Revora Growth Systems</Text>
        <Heading style={h1}>{props.title || "Revora alert"}</Heading>
        {props.summary ? <Text style={text}>{props.summary}</Text> : null}
        {(props.rows ?? [])
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <Row key={label} style={row}>
              <Column style={labelCol}>{label}</Column>
              <Column style={valueCol}>{value}</Column>
            </Row>
          ))}
        <Hr style={hr} />
        <Text style={footer}>
          {props.link ? `Open: ${props.link}` : "Open your admin dashboard for details."}
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => `Revora: ${(data?.["title"] as string) || "alert"}`,
  displayName: "Founder alert (owner)",
  // Owner notification — always goes to the platform owner.
  to: PLATFORM_OWNER_EMAIL,
  previewData: {
    title: "Build failed",
    summary: "A website build stopped before finishing.",
    rows: [
      ["Business", "Harbor Line Plumbing"],
      ["Reason", "layout stage timed out"],
    ],
    link: "https://revoragrowthsystems.com/admin/websites",
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
const footer = { margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#6b6d78" };
