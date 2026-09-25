import type { ComponentType } from "react";
import InviteEmail from "./invite";
import { template as automationMessageTemplate } from "./automation-message";
import { template as leadAlertTemplate } from "./lead-alert";
import { template as newSignupAlertTemplate } from "./new-signup-alert";
import { template as growthAssessmentTemplate } from "./growth-assessment";
import {
  lifecycleBookingFollowUpTemplate,
  lifecycleSetupReminderTemplate,
  lifecycleWelcomeTemplate,
  lifecycleWinbackTemplate,
} from "./lifecycle";

import {
  canceledTemplate,
  planChangedTemplate,
  saleAlertTemplate,
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
  "growth-assessment": growthAssessmentTemplate,
  "billing-welcome": welcomeTemplate,
  "billing-sale-alert": saleAlertTemplate,
  "billing-canceled": canceledTemplate,
  "billing-plan-changed": planChangedTemplate,
  "lifecycle-welcome": lifecycleWelcomeTemplate,
  "lifecycle-setup-reminder": lifecycleSetupReminderTemplate,
  "lifecycle-booking-followup": lifecycleBookingFollowUpTemplate,
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
