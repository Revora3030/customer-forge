/**
 * Owner's switch for the new-lead chime. Off until clicked; the click also
 * satisfies browser autoplay rules and plays the sound once as a preview.
 * Remembered per user in this browser.
 */
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { playLeadChime, readChimeOn, writeChimeOn } from "@/lib/lead-chime";

export function LeadChimeToggle() {
  const [userId, setUserId] = useState<string | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      setOn(readChimeOn(window.localStorage, id));
    });
    return () => {
      active = false;
    };
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    writeChimeOn(window.localStorage, userId, next);
    if (next) playLeadChime();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={on}
      onClick={toggle}
      title={on ? "New-lead sound is on. Click to mute." : "Play a short sound when a new lead arrives."}
    >
      {on ? <Bell className="size-4" /> : <BellOff className="size-4" />}
      {on ? "Lead sound on" : "Lead sound off"}
    </Button>
  );
}
