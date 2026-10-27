/**
 * Past customers who have gone quiet, each with a ready message the owner opens in their own text or
 * email app. Nothing is sent from here. "Mark as messaged" only tags the customer so they leave the list
 * for 90 days.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorNotice } from "@/components/app/QueryErrorNotice";
import { supabase } from "@/integrations/supabase/client";
import { useBusinessProfile, useCustomers } from "@/lib/queries";
import { businessAddress } from "@/lib/estimates/printable-estimate";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";
import {
  DEFAULT_DORMANT_DAYS,
  DORMANT_OPTIONS,
  findDormant,
  mailHref,
  quietLabel,
  smsHref,
  winbackDraft,
  winbackTag,
  type WinbackCustomer,
} from "@/lib/winback";

export function WinbackView({
  customers,
  businessName,
  postalAddress = "",
  now = new Date(),
  onMark,
  marking = false,
}: {
  customers: readonly WinbackCustomer[];
  businessName: string;
  postalAddress?: string;
  now?: Date;
  onMark?: (customer: WinbackCustomer) => void;
  marking?: boolean;
}) {
  const [days, setDays] = useState<number>(DEFAULT_DORMANT_DAYS);
  const [offer, setOffer] = useState("");
  const { shown, total } = useMemo(() => findDormant(customers, now, days), [customers, now, days]);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Quiet for at least" className="flex gap-2">
          {DORMANT_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={`min-h-11 cursor-pointer rounded-md border px-3 text-xs font-medium sm:min-h-9 ${days === option ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {option} days
            </button>
          ))}
        </div>
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="winback-offer" className="text-[11px] text-muted-foreground">
            Optional line from you (an offer, if you have one)
          </Label>
          <Input id="winback-offer" value={offer} maxLength={200} onChange={(event) => setOffer(event.target.value)} />
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customers have been quiet for {days} days or more, or none have a phone or email on file.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((customer) => {
              const draft = winbackDraft(customer.name, businessName, offer, postalAddress);
              const text = customer.phone ? smsHref(customer.phone, draft.text) : null;
              const mail = customer.email ? mailHref(customer.email, draft.emailSubject, draft.emailBody) : null;
              return (
                <li key={customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{customer.name}</p>
                    <p className="text-[12px] text-muted-foreground">Last seen {quietLabel(customer.daysQuiet)} ago</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {text ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={text}>
                          <MessageSquare className="size-4" aria-hidden="true" /> Text
                        </a>
                      </Button>
                    ) : null}
                    {mail ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={mail}>
                          <Mail className="size-4" aria-hidden="true" /> Email
                        </a>
                      </Button>
                    ) : null}
                    {onMark ? (
                      <Button variant="ghost" size="sm" disabled={marking} onClick={() => onMark(customer)}>
                        Mark as messaged
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[12px] text-muted-foreground">
            {total > shown.length ? `Showing ${shown.length} of ${total}. ` : ""}
            Text and Email open your own app with the message filled in, and you press send. Message only people who
            have bought from you or asked to hear from you, and tag anyone who opts out "do not contact" so they stay off this list.
            Send these one at a time yourself; bulk or automated promotional texts need each person's written consent.
            {postalAddress ? "" : " Add your business address in Settings so it can go at the bottom of emails."}
          </p>
        </>
      )}
    </div>
  );
}

export function WinbackCard({ organizationId, businessName }: { organizationId: string | undefined; businessName: string | null }) {
  const customers = useCustomers(organizationId);
  const profile = useBusinessProfile(organizationId);
  const queryClient = useQueryClient();
  const mark = useMutation({
    mutationFn: async (customer: WinbackCustomer) => {
      const tags = [...(customer.tags ?? []), winbackTag(new Date())];
      const { error } = await supabase.from("customers").update({ tags } as never).eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked. They stay off this list for 90 days.");
      void queryClient.invalidateQueries({ queryKey: ["customers", organizationId] });
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save that.")),
  });

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="winback-title">
      <p className="eyebrow">Win back</p>
      <h2 id="winback-title" className="mt-1 text-base font-semibold">
        Past customers who have gone quiet
      </h2>
      {customers.isError ? (
        <div className="mt-3">
          <QueryErrorNotice title="Couldn't load your customers." retry={() => customers.refetch()} retrying={customers.isFetching} />
        </div>
      ) : customers.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <WinbackView
          customers={customers.data}
          businessName={businessName ?? ""}
          postalAddress={businessAddress(profile.data)}
          onMark={(customer) => mark.mutate(customer)}
          marking={mark.isPending}
        />
      )}
    </section>
  );
}
