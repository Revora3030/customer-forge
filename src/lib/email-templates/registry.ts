import type { ComponentType } from "react";
import InviteEmail from "./invite";
import { template as automationMessageTemplate } from "./automation-message";
import { template as leadAlertTemplate } from "./lead-alert";
import { template as leadConfirmationTemplate } from "./lead-confirmation";
import { template as newSignupAlertTemplate } from "./new-signup-alert";
import { template as founderAlertTemplate } from "./founder-alert";
import { template as growthAssessmentTemplate } from "./growth-assessment";
import { template as prospectDemoTemplate } from "./prospect-demo";
import {
  lifecycleBookingFollowUpTemplate,
  lifecycleSetupReminderTemplate,
  lifecycleSiteReadyTemplate,
  lifecycleWelcomeTemplate,
  lifecycleWinbackTemplate,
} from "./lifecycle";

import {
  canceledTemplate,
  paymentFailedTemplate,
  planChangedTemplate,
  saleAlertTemplate,
  siteOfflineWarningTemplate,
  trialEndingTemplate,
  welcomeTemplate,
} from "./billing-lifecycle";

export interface TemplateEntry {
  // Templates have differing prop shapes; the registry is intentionally generic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  subject: string | ((data: Record<string, unknown>) => string);
  displayName?: string;
  previewData?: Record<string, unknown>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  "automation-message": automationMessageTemplate,
  "lead-alert": leadAlertTemplate,
  "lead-confirmation": leadConfirmationTemplate,
  "new-signup-alert": newSignupAlertTemplate,
  "founder-alert": founderAlertTemplate,
  "growth-assessment": growthAssessmentTemplate,
  "prospect-demo": prospectDemoTemplate,
  "billing-welcome": welcomeTemplate,
  "billing-sale-alert": saleAlertTemplate,
  "billing-canceled": canceledTemplate,
  "billing-plan-changed": planChangedTemplate,
  "billing-trial-ending": trialEndingTemplate,
  "billing-payment-failed": paymentFailedTemplate,
  "billing-site-offline-warning": siteOfflineWarningTemplate,
  "lifecycle-welcome": lifecycleWelcomeTemplate,
  "lifecycle-setup-reminder": lifecycleSetupReminderTemplate,
  "lifecycle-booking-followup": lifecycleBookingFollowUpTemplate,
  "lifecycle-site-ready": lifecycleSiteReadyTemplate,
  "lifecycle-winback": lifecycleWinbackTemplate,
  "team-invite": {
    component: InviteEmail,
    subject: (data: Record<string, unknown>) =>
      `You've been invited to ${(data?.["siteName"] as string) || "Revora"}`,
    displayName: "Team invite",
    previewData: {
      siteName: "Elite Mobile Detailing",
      siteUrl: "https://revoragrowthsystems.com",
      confirmationUrl: "https://revoragrowthsystems.com/invite/example-token",
    },
  },
};
