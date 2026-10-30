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

interface Props {
  businessName?: string;
  leadName?: string;
  replyToEmail?: string;
  businessPhone?: string;
  /** Booking requests only: the requested slot and a Google Calendar template link. */
  requestedWhen?: string;
  calendarUrl?: string;
}

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {"We received your request for " + (props.businessName || "our team") + "."}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{props.businessName || "Revora"}</Text>
        <Heading style={h1}>
          {"Thank you for reaching out" + (props.leadName ? ", " + props.leadName : "") + "!"}
        </Heading>
        <Text style={text}>
          We have received your request and our team will get back to you shortly.
        </Text>
        {props.requestedWhen ? (
          <Text style={text}>
            {"Requested time: " + props.requestedWhen + ". We will confirm it with you."}
          </Text>
        ) : null}
        {props.calendarUrl && props.calendarUrl.startsWith("https://calendar.google.com/") ? (
          <Text style={text}>
            <Link href={props.calendarUrl} style={link}>
              Add it to your Google Calendar
            </Link>
          </Text>
        ) : null}
        {props.replyToEmail || props.businessPhone ? (
          <>
            <Hr style={hr} />
            <Text style={label}>Questions before we follow up?</Text>
            {props.replyToEmail ? <Text style={contact}>{props.replyToEmail}</Text> : null}
            {props.businessPhone ? <Text style={contact}>{props.businessPhone}</Text> : null}
          </>
        ) : null}
        <Text style={footer}>
          {"This confirmation was sent because you contacted " + (props.businessName || "our team") + "."}
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    "We received your request — " + ((data?.["businessName"] as string) || "our team"),
  displayName: "Lead confirmation",
  previewData: {
    businessName: "Elite Mobile Detailing",
    leadName: "Jordan Ellis",
    replyToEmail: "hello@example.com",
    businessPhone: "(919) 555-0134",
    requestedWhen: "Tuesday, November 3, 2026 at 2:30 PM",
    calendarUrl:
      "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Detail+%E2%80%94+Elite+Mobile+Detailing+%28requested%29&dates=20261103T143000%2F20261103T153000",
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
const h1 = { margin: "0 0 18px", fontSize: "24px", lineHeight: "1.3", color: "#12131a" };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.6", color: "#33353f" };
const label = { margin: "0 0 6px", fontSize: "13px", fontWeight: 700, color: "#6b6d78" };
const contact = { margin: "0 0 4px", fontSize: "14px", color: "#12131a" };
const link = { color: "#8a6a1f", fontWeight: 700, textDecoration: "underline" };
const hr = { borderColor: "#e7e5df", margin: "20px 0 14px" };
const footer = { margin: "24px 0 0", fontSize: "12px", lineHeight: "1.5", color: "#6b6d78" };
