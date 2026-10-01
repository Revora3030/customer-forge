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
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  businessName?: string;
  heading?: string;
  message?: string;
  signoff?: string;
}

const Email = ({ businessName, heading, message, signoff }: Props) => {
  const paragraphs = (message ?? "").split(/\n{2,}/).filter(Boolean);
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{heading || `A message from ${businessName || "us"}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>{businessName || "Your local team"}</Text>
          <Heading style={h1}>{heading || "A quick follow-up"}</Heading>
          <Section>
            {paragraphs.length ? (
              paragraphs.map((p, i) => (
                <Text key={i} style={text}>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={text}>We wanted to follow up on your recent request.</Text>
            )}
          </Section>
          <Hr style={hr} />
          <Text style={footer}>{signoff || `— ${businessName || "Your local team"}`}</Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    (data?.["heading"] as string) || `A message from ${(data?.["businessName"] as string) || "us"}`,
  displayName: "Automated follow-up",
  previewData: {
    businessName: "Elite Mobile Detailing",
    heading: "Thanks for reaching out, Jordan",
    message: "We got your request for a full interior detail.\n\nWe'll confirm your time shortly.",
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
const hr = { borderColor: "#e7e5df", margin: "24px 0 16px" };
const footer = { margin: 0, fontSize: "13px", color: "#6b6d78" };
