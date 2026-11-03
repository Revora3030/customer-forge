/**
 * Owner inputs for the two facts the generated privacy notice cannot know:
 * how long enquiries are kept and who else receives them. Saved into the
 * existing website settings (`generation.privacyNotice`); blank fields leave
 * a visible placeholder on the notice. See src/lib/privacy-notice-details.ts.
 */
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  PRIVACY_DETAIL_MAX_LENGTH,
  readPrivacyNoticeDetails,
  withPrivacyNoticeDetails,
} from "@/lib/privacy-notice-details";

export function PrivacyNoticeDetails({
  generation,
  canManage,
  saving,
  onSave,
}: {
  generation: unknown;
  canManage: boolean;
  saving?: boolean;
  onSave: (nextGeneration: Record<string, unknown>) => void;
}) {
  const saved = readPrivacyNoticeDetails(generation);
  const [retention, setRetention] = useState(saved.retention ?? "");
  const [sharing, setSharing] = useState(saved.sharing ?? "");
  const retentionId = useId();
  const sharingId = useId();

  useEffect(() => {
    setRetention(saved.retention ?? "");
    setSharing(saved.sharing ?? "");
  }, [saved.retention, saved.sharing]);

  const changed =
    retention.trim() !== (saved.retention ?? "") || sharing.trim() !== (saved.sharing ?? "");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canManage) return;
        onSave(withPrivacyNoticeDetails(generation, { retention, sharing }));
      }}
    >
      <p className="text-sm text-muted-foreground">
        Your website has a privacy notice at /privacy-notice. Revora fills in what the website does.
        Only you know these two things, so write what your business really does. Leave a box empty
        if you are not sure, and the notice will say it has not been provided yet. It appears on
        your site the next time you publish. Review with a lawyer before relying on this.
      </p>
      <div className="space-y-1.5">
        <label htmlFor={retentionId} className="text-sm font-medium">
          How long do you keep enquiries and bookings?
        </label>
        <Textarea
          id={retentionId}
          value={retention}
          maxLength={PRIVACY_DETAIL_MAX_LENGTH}
          disabled={!canManage}
          placeholder="For example: We delete enquiries 12 months after our last contact."
          onChange={(event) => setRetention(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={sharingId} className="text-sm font-medium">
          Who else do you share customers' details with?
        </label>
        <Textarea
          id={sharingId}
          value={sharing}
          maxLength={PRIVACY_DETAIL_MAX_LENGTH}
          disabled={!canManage}
          placeholder="For example: Our scheduling app and our accountant. Or: No one."
          onChange={(event) => setSharing(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={!canManage || !changed || saving}>
        {saving ? "Saving…" : "Save privacy details"}
      </Button>
    </form>
  );
}
