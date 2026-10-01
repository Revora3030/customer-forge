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

/**
 * Activity-based onboarding + retention emails.
 * Sent by the lifecycle job, once per workspace per stage.
 */
interface LifecycleProps {
  businessName?: string;
  firstName?: string;
  /** The single next action, taken straight from the onboarding checklist. */
  nextAction?: string;
  nextActionWhy?: string;
  actionUrl?: string;
  trialEnds?: string;
  daysLeft?: number;
  bookingName?: string;
  bookingWhen?: string;
  leadCount?: number;
  daysAway?: number;
}

const APP = "https://revoragrowthsystems.com/app";

const Shell = (props: { preview: string; heading: string; children: React.ReactNode }) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{props.preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Revora Growth Systems</Text>
        <Heading style={h1}>{props.heading}</Heading>
        {props.children}
        <Hr style={hr} />
        <Text style={footer}>
          Questions? Reply to this email or call (919) 622-6620 — we answer fast.
        </Text>
      </Container>
    </Body>
  </Html>
);

const cta = (url: string, label: string) => (
  <Link href={url} style={button}>
    {label}
  </Link>
);

const WelcomeEmail = (p: LifecycleProps) => (
  <Shell
    preview="Your Revora workspace is open — here's your first step"
    heading={`Welcome${p.firstName ? `, ${p.firstName}` : ""} — your workspace is open`}
  >
    <Text style={text}>
      {p.businessName || "Your business"} now has a full Revora workspace: website builder, lead
      capture, quotes, booking calendar, follow-up automations, reviews, local SEO and analytics.
    </Text>
    <Text style={text}>
      <strong>Your next step: {p.nextAction || "finish your business details"}.</strong>{" "}
      {p.nextActionWhy || "Your answers auto-fill your website, quotes and follow-up."}
    </Text>
    {p.trialEnds ? (
      <Text style={text}>
        Your free full access runs until <strong>{p.trialEnds}</strong>. Nothing is charged before
        you choose to activate.
      </Text>
    ) : null}
    {cta(p.actionUrl || APP, "Open my next step")}
  </Shell>
);

const SetupReminderEmail = (p: LifecycleProps) => (
  <Shell
    preview={`One step left: ${p.nextAction || "finish your setup"}`}
    heading={`${p.businessName || "Your site"} is one step from working for you`}
  >
    <Text style={text}>
      You're partway through setup. The next thing that moves the needle:{" "}
      <strong>{p.nextAction || "finish your website details"}</strong>.
    </Text>
    <Text style={text}>
      {p.nextActionWhy || "It takes a couple of minutes and unlocks the rest."}
    </Text>
    {typeof p.daysLeft === "number" && p.daysLeft > 0 ? (
      <Text style={text}>
        You have{" "}
        <strong>
          {p.daysLeft} day{p.daysLeft === 1 ? "" : "s"}
        </strong>{" "}
        of free full access left{p.trialEnds ? ` (ends ${p.trialEnds})` : ""}.
      </Text>
    ) : null}
    {cta(p.actionUrl || APP, "Finish this step")}
  </Shell>
);

const BookingFollowUpEmail = (p: LifecycleProps) => (
  <Shell
    preview="A booking came in — here's how to close it"
    heading={`${p.bookingName || "A customer"} booked with ${p.businessName || "you"}`}
  >
    <Text style={text}>
      {p.bookingName || "A customer"} requested
      {p.bookingWhen ? ` ${p.bookingWhen}` : " an appointment"}. It's already in your calendar and
      CRM.
    </Text>
    <Text style={text}>
      Confirm the time and send the quote while you're top of mind — the businesses that reply first
      win the job most of the time.
    </Text>
    {cta(`${APP}/calendar`, "Open the booking")}
  </Shell>
);

const WinbackEmail = (p: LifecycleProps) => (
  <Shell
    preview="Your Revora system is still set up and waiting"
    heading="Everything you built is still here"
  >
    <Text style={text}>
      It's been {p.daysAway || 7} days since you were in {p.businessName || "your workspace"}.
      Nothing was lost — your site, services, forms and settings are exactly as you left them.
    </Text>
    {p.leadCount && p.leadCount > 0 ? (
      <Text style={text}>
        You have <strong>{p.leadCount}</strong> lead{p.leadCount === 1 ? "" : "s"} waiting for a
        reply.
      </Text>
    ) : null}
    <Text style={text}>
      <strong>Pick up here: {p.nextAction || "publish your website"}.</strong>{" "}
      {p.nextActionWhy || "It is the fastest thing you can do to start getting enquiries."}
    </Text>
    {cta(p.actionUrl || APP, "Pick up where I left off")}
  </Shell>
);

const preview = {
  businessName: "Elite Mobile Detailing",
  firstName: "Adam",
  nextAction: "Turn on local SEO",
  nextActionWhy: "Your city, service area and hours are what local search results are built from.",
  actionUrl: `${APP}/website`,
  trialEnds: "September 2, 2026",
  daysLeft: 2,
  bookingName: "Dana R.",
  bookingWhen: "Thursday at 10:00 AM",
  leadCount: 3,
  daysAway: 7,
};

export const lifecycleWelcomeTemplate = {
  component: WelcomeEmail,
  subject: () => "Your Revora workspace is open — start here",
  displayName: "Lifecycle: welcome",
  previewData: preview,
} satisfies TemplateEntry;

export const lifecycleSetupReminderTemplate = {
  component: SetupReminderEmail,
  subject: (d: Record<string, unknown>) =>
    `Next step: ${(d?.["nextAction"] as string) || "finish your Revora setup"}`,
  displayName: "Lifecycle: setup reminder",
  previewData: preview,
} satisfies TemplateEntry;

export const lifecycleBookingFollowUpTemplate = {
  component: BookingFollowUpEmail,
  subject: (d: Record<string, unknown>) =>
    `New booking: ${(d?.["bookingName"] as string) || "a customer"} — confirm and quote`,
  displayName: "Lifecycle: booking follow-up",
  previewData: preview,
} satisfies TemplateEntry;

export const lifecycleWinbackTemplate = {
  component: WinbackEmail,
  subject: () => "Your Revora system is still set up and waiting",
  displayName: "Lifecycle: win-back",
  previewData: preview,
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
