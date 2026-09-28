import React from "react";
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  businessName?: string;
  leadName?: string;
  replyEmail?: string;
  phone?: string;
}

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Thank you for reaching out to ${props.businessName || "our team"}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>{props.businessName || "Revora"}</Text>
        <Heading style={h1}>Thank you for reaching out!</Heading>
        <Text style={text}>
          Hi {props.leadName || "there"}, thank you for reaching out to {props.businessName || "our team"}!
          We have received your request and our team will get back to you shortly.
        </Text>
        {props.replyEmail || props.phone ? (
          <>
            <Hr style={hr} />
            <Text style={contactHeading}>Need to reach us directly?</Text>
            {props.replyEmail ? <Text style={contact}>Email: {props.replyEmail}</Text> : null}
            {props.phone ? <Text style={contact}>Phone: {props.phone}</Text> : null}
          </>
        ) : null}
        <Text style={footer}>This is a confirmation that your request was received.</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    `Thank you for reaching out to ${(data?.["businessName"] as string) || "our team"}!`,
  displayName: "Lead confirmation",
  previewData: {
    businessName: "Elite Mobile Detailing",
    leadName: "Jordan Ellis",
    replyEmail: "hello@example.com",
    phone: "(919) 555-0134",
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
const h1 = { margin: "0 0 18px", fontSize: "22px", lineHeight: "1.3", color: "#12131a" };
const text = { margin: "0 0 14px", fontSize: "15px", lineHeight: "1.65", color: "#33353f" };
const contactHeading = { margin: "0 0 6px", fontSize: "13px", fontWeight: 700, color: "#12131a" };
const contact = { margin: "3px 0", fontSize: "14px", color: "#33353f" };
const hr = { borderColor: "#e7e5df", margin: "20px 0 14px" };
const footer = { margin: "22px 0 0", fontSize: "12px", color: "#6b6d78" };
