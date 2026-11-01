/**
 * "WhatsApp" reply link beside Call / Text / Email on a lead. It only opens the
 * owner's own WhatsApp (wa.me); Revora sends nothing. Hidden when the phone
 * can't be turned into an international number, or when the number is on the
 * do-not-contact list (or that list can't be read).
 */
import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/lead-chime";
import { getLeadWhatsAppAllowed } from "@/lib/lead-whatsapp.functions";

export function LeadWhatsAppButton({
  organizationId,
  leadId,
  phone,
  onOpen,
}: {
  organizationId: string | undefined;
  leadId: string;
  phone: string | null | undefined;
  onOpen?: () => void;
}) {
  const href = whatsappLink(phone);
  const { data } = useQuery({
    queryKey: ["lead-whatsapp-allowed", organizationId, leadId, phone],
    enabled: Boolean(href && organizationId),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => getLeadWhatsAppAllowed({ data: { organizationId: organizationId!, leadId } }),
  });
  if (!href || data?.allowed !== true) return null;
  return (
    <Button asChild variant="outline" size="sm" onClick={onOpen}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4" /> WhatsApp
      </a>
    </Button>
  );
}
