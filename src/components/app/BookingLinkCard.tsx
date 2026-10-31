/**
 * "My booking link" card for Settings. The owner pastes the page where they
 * already take bookings; it is validated (https only), saved into the existing
 * business profile, and shown on their public site as a "Book online" link.
 * Nothing is sent to anyone.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Save } from "lucide-react";
import { toast } from "@/lib/ui/notify";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/user-error";
import { useBusinessProfile } from "@/lib/queries";
import { BOOKING_LINK_RULE, bookingLinkFromHours, cleanBookingLink, hoursWithBookingLink } from "@/lib/booking-link";

function useSaveBookingLink(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string | null) => {
      if (!organizationId) throw new Error("Workspace not loaded yet.");
      // Read the current hours right before writing so days, summary and the
      // holiday flag the owner saved elsewhere are never overwritten.
      const { data, error: readError } = await supabase
        .from("business_profiles")
        .select("hours")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (readError) throw readError;
      const hours = hoursWithBookingLink((data as { hours?: unknown } | null)?.hours, url);
      const { error } = await supabase
        .from("business_profiles")
        .upsert({ organization_id: organizationId, hours } as never, { onConflict: "organization_id" });
      if (error) throw error;
    },
    onSuccess: (_data, url) => {
      toast.success(url ? "Booking link saved." : "Booking link removed.");
      void queryClient.invalidateQueries({ queryKey: ["business_profile", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your booking link.")),
  });
}

export function BookingLinkCard({
  organizationId,
  canManage,
}: {
  organizationId: string | undefined;
  canManage: boolean;
}) {
  const profile = useBusinessProfile(organizationId);
  const save = useSaveBookingLink(organizationId);
  const saved = bookingLinkFromHours(profile.data?.hours);
  const [input, setInput] = useState(saved ?? "");
  const [touched, setTouched] = useState(false);

  // Follow the saved value until the owner starts typing.
  useEffect(() => {
    if (!touched) setInput(saved ?? "");
  }, [saved, touched]);

  const parsed = useMemo(() => cleanBookingLink(input), [input]);
  const nextUrl = parsed.ok ? parsed.url : null;
  const unsaved = parsed.ok && nextUrl !== saved;

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Bookings" title="My booking link" />
      <p className="mt-2 text-[13px] text-muted-foreground">
        Already take bookings in Calendly, Cal.com, Acuity, Square or another tool? Paste that page here and your
        website shows a “Book online” link to it.
      </p>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="booking-link-input">Booking page address</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="booking-link-input"
            className="min-w-60 flex-1"
            inputMode="url"
            autoComplete="off"
            placeholder="https://calendly.com/your-business"
            value={input}
            disabled={!canManage || profile.isLoading}
            onChange={(event) => {
              setTouched(true);
              setInput(event.target.value);
            }}
            aria-invalid={!parsed.ok}
            aria-describedby="booking-link-note"
          />
          {canManage ? (
            <Button
              variant="outline"
              disabled={!unsaved || save.isPending || !parsed.ok}
              onClick={() => save.mutate(nextUrl, { onSuccess: () => setTouched(false) })}
            >
              <Save className="size-4" /> {save.isPending ? "Saving…" : nextUrl ? "Save link" : "Remove link"}
            </Button>
          ) : null}
        </div>
        <p id="booking-link-note" className="text-[12px] text-muted-foreground" role="status">
          {!parsed.ok
            ? parsed.message
            : nextUrl
              ? unsaved
                ? `${parsed.provider ? `${parsed.provider} link recognised. ` : ""}Save it to show “Book online” on your website.`
                : "Saved. Your website shows a “Book online” link."
              : saved
                ? "Clear the box and save to remove the link."
                : BOOKING_LINK_RULE}
        </p>
        {nextUrl ? (
          <p className="flex items-center gap-1.5 break-all text-[12px]">
            <CalendarCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {nextUrl}
          </p>
        ) : null}
        {profile.isError ? (
          <p className="text-[12px] text-destructive">Couldn't load your saved link. Reload the page to try again.</p>
        ) : null}
      </div>
    </Panel>
  );
}
