/**
 * Real workspace facts Pre-Flight needs that aren't already loaded by the
 * builder: how many questions the quote calculator asks, whether anyone is
 * notified about a new enquiry, and how many follow-up automations are running.
 *
 * Every value is read from the database. When a value can't be read it stays
 * `null` and Pre-Flight skips that check rather than reporting a guess.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { alertRecipient } from "@/lib/lead-alert-recipient";

export type PreflightFacts = {
  quoteQuestionCount: number | null;
  notifiesOwner: boolean;
  followUpAutomations: number;
  hasHours: boolean;
};

export function usePreflightFacts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["preflight_facts", organizationId],
    enabled: !!organizationId,
    queryFn: async (): Promise<PreflightFacts> => {
      const orgId = organizationId!;
      const [forms, profile, automations] = await Promise.all([
        supabase
          .from("quote_forms")
          .select("id, quote_questions!quote_questions_form_id_fkey(id)")
          .eq("organization_id", orgId)
          .eq("is_active", true),
        supabase
          .from("business_profiles")
          .select("notification_email, email, owner_email, notify_on_lead, hours")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("automations")
          .select("id")
          .eq("organization_id", orgId)
          .eq("is_active", true),
      ]);

      // Only questions a visitor can answer count: a question with no options
      // leaves the calculator unable to show a price.
      let questionCount: number | null = null;
      if (!forms.error) {
        const questionIds = (forms.data ?? []).flatMap((form) =>
          ((form as { quote_questions?: { id: string }[] }).quote_questions ?? []).map((q) => q.id),
        );
        if (!questionIds.length) {
          questionCount = 0;
        } else {
          const options = await supabase
            .from("quote_options")
            .select("question_id")
            .eq("organization_id", orgId)
            .in("question_id", questionIds);
          questionCount = options.error
            ? null
            : new Set((options.data ?? []).map((row) => row.question_id)).size;
        }
      }

      const p = (profile.data ?? null) as {
        notification_email?: string | null;
        owner_email?: string | null;
        email?: string | null;
        notify_on_lead?: boolean | null;
        hours?: unknown;
      } | null;
      const hours = p?.hours;

      return {
        quoteQuestionCount: questionCount,
        // Same inbox rules as the real sender (valid address, alerts switched on).
        notifiesOwner: p ? alertRecipient(p) !== null : false,
        followUpAutomations: (automations.data ?? []).length,
        hasHours: !!hours && typeof hours === "object" && Object.keys(hours).length > 0,
      };
    },
  });
}
