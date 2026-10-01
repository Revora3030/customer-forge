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

interface BillingProps {
  businessName?: string;
  planName?: string;
  interval?: string;
  amount?: string;
  accessUntil?: string;
  previousPlan?: string;
  newPlan?: string;
  billingUrl?: string;
  /** Formatted date of the next charge (trial ending) or next retry (payment failed). */
  chargeDate?: string;
  /** Short, customer-safe reason the card was declined, when Stripe provides one. */
  declineReason?: string;
}

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

const WelcomeEmail = (p: BillingProps) => (
  <Shell
    preview={`Your ${p.planName || "Revora"} plan is active`}
    heading={`Welcome aboard, ${p.businessName || "there"} — ${p.planName || "your plan"} is live`}
  >
    <Text style={text}>
      <strong>$750 setup payment received.</strong> Your {p.planName || "Revora Growth System"}{" "}
      workspace is ready — website builder, CRM, booking calendar, quote engine and automations are
      unlocked right now.
    </Text>
    <Text style={text}>
      <strong>First month free.</strong> Your first $100 monthly payment is charged after 30 days
      unless canceled{p.accessUntil ? ` — your trial ends ${p.accessUntil}` : ""}. Cancel anytime
      from billing. No hidden fees.
    </Text>
    <Text style={text}>
      Best first step: open your Growth Center and finish the website brief — Revora can draft your
      lead-generating site from it in minutes.
    </Text>
    {cta(p.billingUrl || "https://revoragrowthsystems.com/app", "Open your workspace")}
  </Shell>
);

const SaleAlertEmail = (p: BillingProps) => (
  <Shell
    preview={`New sale: ${p.businessName || "a customer"} — ${p.planName || ""}`}
    heading={`New subscription: ${p.businessName || "A customer"}`}
  >
    <Text style={text}>
      {p.businessName || "A customer"} just started the {p.planName || "Revora"} plan (
      {p.interval || "monthly"}
      {p.amount ? ` — ${p.amount}` : ""}).
    </Text>
    <Text style={text}>
      Their workspace was provisioned automatically. Log in to review their onboarding progress.
    </Text>
  </Shell>
);

const CanceledEmail = (p: BillingProps) => (
  <Shell
    preview="Your Revora subscription was canceled"
    heading="Your subscription is set to cancel"
  >
    <Text style={text}>
      We've processed your cancellation for {p.businessName || "your workspace"}. You keep full
      access until <strong>{p.accessUntil || "the end of your billing period"}</strong>, and your
      website, leads, and CRM data stay safe — nothing is deleted.
    </Text>
    <Text style={text}>
      After that date your workspace becomes read-only: you can still view and export everything,
      and you can reactivate any time to pick up exactly where you left off.
    </Text>
    <Text style={text}>Changed your mind? One click keeps everything running.</Text>
    {cta(p.billingUrl || "https://revoragrowthsystems.com/app/billing", "Keep my subscription")}
  </Shell>
);

const TrialEndingEmail = (p: BillingProps) => (
  <Shell
    preview={`Your free month ends ${p.chargeDate || "soon"} — ${p.amount || "$100.00"}/month starts then`}
    heading={`Your free month ends ${p.chargeDate || "in a few days"}`}
  >
    <Text style={text}>
      Heads up for {p.businessName || "your workspace"}: your first free month of the{" "}
      {p.planName || "Revora Growth System"} ends on{" "}
      <strong>{p.chargeDate || "the date shown in billing"}</strong>. Your first monthly payment of{" "}
      <strong>{p.amount || "$100.00"}</strong> will be charged to the card on file that day, and it
      renews monthly after that.
    </Text>
    <Text style={text}>
      Nothing to do if you're staying. If you need to update your card or cancel, you can do it from
      billing any time before that date — no penalties, no hidden fees.
    </Text>
    {cta(p.billingUrl || "https://revoragrowthsystems.com/app/billing", "Review billing")}
  </Shell>
);

const PaymentFailedEmail = (p: BillingProps) => (
  <Shell
    preview={`Action needed: your ${p.amount || "Revora"} payment didn't go through`}
    heading="Your payment didn't go through"
  >
    <Text style={text}>
      We couldn't charge the card on file for {p.businessName || "your workspace"}
      {p.amount ? ` (${p.amount})` : ""}.
      {p.declineReason ? ` Your bank said: "${p.declineReason}"` : ""}
    </Text>
    <Text style={text}>
      Your website, leads and CRM keep running for now.{" "}
      {p.chargeDate
        ? `We'll try again on ${p.chargeDate}.`
        : "We'll retry automatically over the next few days."}{" "}
      Updating your card takes under a minute and stops any interruption.
    </Text>
    <Text style={text}>
      Tip: prepaid and some debit cards block recurring charges. A regular credit or debit card, or
      a bank account, usually fixes it.
    </Text>
    {cta(p.billingUrl || "https://revoragrowthsystems.com/app/billing", "Update payment method")}
  </Shell>
);

const PlanChangedEmail = (p: BillingProps) => (
  <Shell
    preview={`Plan updated: ${p.previousPlan || ""} → ${p.newPlan || ""}`}
    heading={`Your plan changed to ${p.newPlan || "a new plan"}`}
  >
    <Text style={text}>
      {p.businessName || "Your workspace"} moved from {p.previousPlan || "the previous plan"} to{" "}
      <strong>{p.newPlan || "a new plan"}</strong>. The change is prorated automatically — you only
      pay the difference for the rest of this period, and your new features are active now.
    </Text>
    {cta(p.billingUrl || "https://revoragrowthsystems.com/app/billing", "Review billing")}
  </Shell>
);

const data = {
  businessName: "Elite Mobile Detailing",
  planName: "Revora Growth System",
  interval: "monthly",
  amount: "$100.00",
  accessUntil: "September 28, 2026",
  chargeDate: "October 28, 2026",
  declineReason: "Your card does not support this type of purchase.",
  previousPlan: "Revora Growth System",
  newPlan: "Revora Growth System",
  billingUrl: "https://revoragrowthsystems.com/app/billing",
};

export const welcomeTemplate = {
  component: WelcomeEmail,
  subject: (d: Record<string, unknown>) =>
    `Welcome to Revora — your ${(d?.["planName"] as string) || "plan"} plan is live`,
  displayName: "Billing: welcome",
  previewData: data,
} satisfies TemplateEntry;

export const saleAlertTemplate = {
  component: SaleAlertEmail,
  subject: (d: Record<string, unknown>) =>
    `New sale: ${(d?.["businessName"] as string) || "A customer"} — ${(d?.["planName"] as string) || "subscription"}`,
  displayName: "Billing: new sale alert",
  to: "Revorabusiness0@gmail.com",
  previewData: data,
} satisfies TemplateEntry;

export const canceledTemplate = {
  component: CanceledEmail,
  subject: () => "Your Revora subscription is set to cancel — access continues for now",
  displayName: "Billing: cancellation (win-back)",
  previewData: data,
} satisfies TemplateEntry;

export const trialEndingTemplate = {
  component: TrialEndingEmail,
  subject: (d: Record<string, unknown>) =>
    `Your free month ends ${(d?.["chargeDate"] as string) || "soon"} — here's what happens next`,
  displayName: "Billing: trial ending reminder",
  previewData: data,
} satisfies TemplateEntry;

export const paymentFailedTemplate = {
  component: PaymentFailedEmail,
  subject: () => "Action needed: your Revora payment didn't go through",
  displayName: "Billing: payment failed",
  previewData: data,
} satisfies TemplateEntry;

export const planChangedTemplate = {
  component: PlanChangedEmail,
  subject: (d: Record<string, unknown>) =>
    `Plan updated: you're now on ${(d?.["newPlan"] as string) || "a new plan"}`,
  displayName: "Billing: plan changed",
  previewData: data,
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
