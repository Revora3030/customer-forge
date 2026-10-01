/* eslint-disable react-refresh/only-export-components -- email registry descriptors intentionally reference local React Email components. */
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
  businessName?: string;
  kind?: string;
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  city?: string;
  service?: string;
  estimate?: string;
  budget?: string;
  message?: string;
  when?: string;
}

const rowsOf = (p: Props) =>
  [
    ["Name", p.leadName],
    ["Email", p.leadEmail],
    ["Phone", p.leadPhone],
    ["City", p.city],
    ["Service", p.service],
    ["Estimate", p.estimate],
    ["Budget", p.budget],
    ["Requested time", p.when],
  ].filter(([, v]) => Boolean(v)) as [string, string][];

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${props.kind || "New lead"}: ${props.leadName || "someone"}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{props.businessName || "Revora"}</Text>
        <Heading
          style={h1}
        >{`${props.kind || "New lead"}: ${props.leadName || "someone"}`}</Heading>
        {rowsOf(props).map(([label, value]) => (
          <Row key={label} style={row}>
            <Column style={labelCol}>{label}</Column>
            <Column style={valueCol}>{value}</Column>
          </Row>
        ))}
        {props.message ? (
          <>
            <Hr style={hr} />
            <Text style={text}>{props.message}</Text>
          </>
        ) : null}
        <Hr style={hr} />
        <Text style={footer}>Open your workspace to reply, quote, or book this customer.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    `${(data?.["kind"] as string) || "New lead"}: ${(data?.["leadName"] as string) || "someone"}`,
  displayName: "New lead alert",
  previewData: {
    businessName: "Elite Mobile Detailing",
    kind: "New booking request",
    leadName: "Jordan Ellis",
    leadEmail: "jordan@example.com",
    leadPhone: "(919) 555-0134",
    city: "Raleigh",
    service: "Full interior detail",
    estimate: "$240–$320",
    budget: "$240–$320",
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
const row = { marginBottom: "6px" };
const labelCol = { width: "130px", fontSize: "13px", color: "#6b6d78" };
const valueCol = { fontSize: "14px", color: "#12131a", fontWeight: 600 };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const hr = { borderColor: "#e7e5df", margin: "20px 0 14px" };
const footer = { margin: 0, fontSize: "13px", color: "#6b6d78" };
